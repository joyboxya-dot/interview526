import cors from '@fastify/cors'
import Fastify from 'fastify'
import { z } from 'zod'
import { scoreTurnHeuristically } from '../src/speech/browserHeuristics'
import type { EvaluationOutcome } from '../src/speech/evaluatorTypes'
import { evaluateWithAzure, synthesizeWithAzure } from './azureEvaluator'
import { synthesizeWithSystemVoice } from './localTts'
import { transcribeWithSystemSpeech } from './localSpeechRecognizer'

const MetricsSchema = z.object({
  leadInMs: z.number(),
  speechDurationMs: z.number(),
  detectedSpeechMs: z.number(),
  trailingSilenceMs: z.number(),
  totalTurnMs: z.number(),
})

const TurnSchema = z.object({
  status: z.union([z.literal('captured'), z.literal('idle')]),
  transcript: z.string(),
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  metrics: MetricsSchema,
})

const CardSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  type: z.union([
    z.literal('bridge'),
    z.literal('body'),
    z.literal('filler'),
    z.literal('glue'),
  ]),
  order: z.number(),
  prompt: z.string(),
  answer: z.string(),
  answerKo: z.string().optional(),
  keywords: z.array(z.string()),
  cloze: z.string(),
})

const AzureEvaluationRequestSchema = z.object({
  card: CardSchema,
  topic: z.object({
    id: z.string(),
    title: z.string(),
    question: z.string(),
  }),
  hintLevel: z.number(),
  turn: TurnSchema,
})

const AzureTtsRequestSchema = z.object({
  text: z.string().min(1),
  voiceName: z.string().optional(),
})

const LocalTranscriptionRequestSchema = z.object({
  audioBase64: z.string().min(1),
  language: z.string().optional(),
})

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin: true,
})

app.get('/api/health', async () => ({
  ok: true,
}))

app.post('/api/evaluate/azure', async (request, reply) => {
  const payload = AzureEvaluationRequestSchema.parse(request.body)
  const heuristicOutcome = scoreTurnHeuristically(payload.card, payload.turn)

  if (!payload.turn.audioBase64 || !process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
    return {
      ...heuristicOutcome,
      reasonCodes: [...heuristicOutcome.reasonCodes, 'azure_fallback_heuristic'],
    } satisfies EvaluationOutcome
  }

  try {
    const azureResult = await evaluateWithAzure(payload.turn.audioBase64, payload.card.answer)
    const completenessScore = round(azureResult.completenessScore / 100)
    const accuracyScore = round(azureResult.accuracyScore / 100)
    const fluencyScore = round(azureResult.fluencyScore / 100)
    const contentScore = round((completenessScore + accuracyScore) / 2)

    let status: EvaluationOutcome['status']
    if (contentScore < 0.55 || completenessScore < 0.55) {
      status = 'fail_content'
    } else if (fluencyScore < 0.62) {
      status = 'pass_content_weak_fluency'
    } else {
      status = 'pass_content_good_fluency'
    }

    return {
      status,
      transcript: azureResult.transcript || payload.turn.transcript,
      metrics: {
        contentScore,
        fluencyScore,
        completenessScore,
        accuracyScore,
        prosodyScore:
          typeof azureResult.prosodyScore === 'number'
            ? round(azureResult.prosodyScore / 100)
            : undefined,
        keywordCoverage: heuristicOutcome.metrics.keywordCoverage,
      },
      reasonCodes: ['azure_pronunciation_assessment'],
    } satisfies EvaluationOutcome
  } catch (error) {
    request.log.error(error)
    reply.status(502)
    return {
      ...heuristicOutcome,
      reasonCodes: [...heuristicOutcome.reasonCodes, 'azure_request_failed'],
    } satisfies EvaluationOutcome
  }
})

app.post('/api/speak/azure', async (request, reply) => {
  const payload = AzureTtsRequestSchema.parse(request.body)

  try {
    const synthesis = await synthesizeWithAzure(payload.text, payload.voiceName)
    reply.header('Content-Type', synthesis.contentType)
    return reply.send(synthesis.audioBuffer)
  } catch (error) {
    request.log.error(error)
    reply.status(502)
    return {
      error: 'azure_tts_failed',
    }
  }
})

app.post('/api/speak/local', async (request, reply) => {
  const payload = AzureTtsRequestSchema.parse(request.body)

  try {
    const synthesis = await synthesizeWithSystemVoice(payload.text, payload.voiceName ?? 'Samantha')
    reply.header('Content-Type', synthesis.contentType)
    return reply.send(synthesis.audioBuffer)
  } catch (error) {
    request.log.error(error)
    reply.status(502)
    return {
      error: 'local_tts_failed',
    }
  }
})

app.post('/api/transcribe/local', async (request, reply) => {
  const payload = LocalTranscriptionRequestSchema.parse(request.body)

  try {
    const transcript = await transcribeWithSystemSpeech(payload.audioBase64, payload.language ?? 'en-US')
    return {
      transcript,
    }
  } catch (error) {
    request.log.error(error)
    reply.status(502)
    return {
      error: 'local_transcription_failed',
    }
  }
})

const port = Number(process.env.PORT ?? 8787)
await app.listen({
  port,
  host: '0.0.0.0',
})

function round(value: number): number {
  return Math.round(value * 100) / 100
}
