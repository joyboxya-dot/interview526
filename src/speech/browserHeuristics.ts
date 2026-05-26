import { normalizeForMatch, tokenizeEnglish } from '../lib/text'
import type { TopicCard } from '../content/contentTypes'
import type { EvaluationOutcome, SpeechTurnResult } from './evaluatorTypes'

export function scoreTurnHeuristically(card: TopicCard, turn: SpeechTurnResult): EvaluationOutcome {
  if (turn.status === 'idle') {
    return {
      status: 'no_speech_or_idle',
      transcript: turn.transcript,
      metrics: {
        contentScore: 0,
        fluencyScore: 0,
        completenessScore: 0,
        keywordCoverage: 0,
      },
      reasonCodes: ['idle_or_empty_transcript'],
    }
  }

  if (!turn.transcript.trim()) {
    return {
      status: 'fail_content',
      transcript: turn.transcript,
      metrics: {
        contentScore: 0,
        fluencyScore: turn.metrics.speechDurationMs > 1_500 ? 0.45 : 0.15,
        completenessScore: 0,
        keywordCoverage: 0,
      },
      reasonCodes: ['speech_detected_but_transcript_empty'],
    }
  }

  const transcript = normalizeForMatch(turn.transcript)
  const transcriptTokens = new Set(tokenizeEnglish(transcript))
  const answerTokens = tokenizeEnglish(card.answer)
  const answerTokenSet = new Set(answerTokens)
  const keywordMatches = card.keywords.filter((keyword) => transcriptTokens.has(keyword.toLowerCase()))
  const answerMatches = [...transcriptTokens].filter((token) => answerTokenSet.has(token))

  const keywordCoverage = card.keywords.length === 0 ? 0 : keywordMatches.length / card.keywords.length
  const answerCoverage = answerTokens.length === 0 ? 0 : answerMatches.length / answerTokenSet.size
  const contentScore = round(Math.min(1, keywordCoverage * 0.65 + answerCoverage * 0.35))

  const wordsPerMinute =
    turn.metrics.speechDurationMs > 0
      ? (transcript.split(' ').filter(Boolean).length / turn.metrics.speechDurationMs) * 60_000
      : 0

  const leadInPenalty = turn.metrics.leadInMs > 3_500 ? 0.35 : turn.metrics.leadInMs > 2_500 ? 0.18 : 0
  const durationPenalty = turn.metrics.speechDurationMs < 1_500 ? 0.25 : 0
  const speedPenalty = wordsPerMinute < 75 ? 0.22 : wordsPerMinute < 95 ? 0.1 : 0
  const fluencyScore = round(Math.max(0, 1 - leadInPenalty - durationPenalty - speedPenalty))

  const completenessScore = round(Math.min(1, answerCoverage + keywordCoverage * 0.2))
  const reasonCodes: string[] = []

  if (contentScore < 0.55 || completenessScore < 0.52) {
    reasonCodes.push('content_below_threshold')
    return {
      status: 'fail_content',
      transcript: turn.transcript,
      metrics: {
        contentScore,
        fluencyScore,
        completenessScore,
        keywordCoverage: round(keywordCoverage),
      },
      reasonCodes,
    }
  }

  if (fluencyScore < 0.62) {
    reasonCodes.push('fluency_needs_replay')
    return {
      status: 'pass_content_weak_fluency',
      transcript: turn.transcript,
      metrics: {
        contentScore,
        fluencyScore,
        completenessScore,
        keywordCoverage: round(keywordCoverage),
      },
      reasonCodes,
    }
  }

  reasonCodes.push('content_and_fluency_good')
  return {
    status: 'pass_content_good_fluency',
    transcript: turn.transcript,
    metrics: {
      contentScore,
      fluencyScore,
      completenessScore,
      keywordCoverage: round(keywordCoverage),
    },
    reasonCodes,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
