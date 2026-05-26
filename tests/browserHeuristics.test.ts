import { describe, expect, it } from 'vitest'
import { scoreTurnHeuristically } from '../src/speech/browserHeuristics'

describe('browser heuristic evaluator', () => {
  it('treats captured audio with empty transcript as content failure, not idle', () => {
    const outcome = scoreTurnHeuristically(
      {
        id: 'card-1',
        topicId: 'topic-1',
        type: 'body',
        order: 0,
        prompt: 'Recall',
        answer: 'When I joined the project',
        keywords: ['joined', 'project'],
        cloze: 'When I j_____ the p_______',
      },
      {
        status: 'captured',
        transcript: '',
        metrics: {
          leadInMs: 500,
          speechDurationMs: 4000,
          detectedSpeechMs: 2400,
          trailingSilenceMs: 1000,
          totalTurnMs: 5000,
        },
      },
    )

    expect(outcome.status).toBe('fail_content')
    expect(outcome.reasonCodes).toContain('speech_detected_but_transcript_empty')
  })
})
