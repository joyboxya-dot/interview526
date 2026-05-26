import type { TopicCard, NormalizedTopic } from '../content/contentTypes'

export type EvaluationStatus =
  | 'pass_content_good_fluency'
  | 'pass_content_weak_fluency'
  | 'fail_content'
  | 'no_speech_or_idle'

export type EvaluatorMode = 'browser' | 'azure'

export interface TurnMetrics {
  leadInMs: number
  speechDurationMs: number
  detectedSpeechMs: number
  trailingSilenceMs: number
  totalTurnMs: number
}

export interface SpeechTurnResult {
  status: 'captured' | 'idle'
  transcript: string
  audioBase64?: string
  mimeType?: string
  metrics: TurnMetrics
}

export interface EvaluationOutcome {
  status: EvaluationStatus
  transcript?: string
  metrics: {
    contentScore: number
    fluencyScore: number
    completenessScore: number
    accuracyScore?: number
    prosodyScore?: number
    keywordCoverage: number
  }
  reasonCodes: string[]
}

export interface EvaluatorRequest {
  card: TopicCard
  topic: NormalizedTopic
  hintLevel: number
  turn: SpeechTurnResult
}

export interface EvaluatorAdapter {
  id: EvaluatorMode
  evaluate(request: EvaluatorRequest): Promise<EvaluationOutcome>
}
