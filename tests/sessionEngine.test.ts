import { describe, expect, it } from 'vitest'
import { AutoSessionController } from '../src/session/autoSessionController'
import { nextHintLevel } from '../src/session/hintEngine'
import { cardsByTopic, normalizedTopics } from '../src/data/loadDataset'
import { SpacedRepetitionStore } from '../src/storage/spacedRepetitionStore'
import { createMemoryStorageAdapter } from '../src/storage/storageAdapter'

const metrics = {
  contentScore: 0.8,
  fluencyScore: 0.7,
  completenessScore: 0.8,
  keywordCoverage: 0.8,
}

describe('session engine', () => {
  it('escalates hint level after content failure', () => {
    expect(nextHintLevel(0, 'fail_content')).toBe(1)
    expect(nextHintLevel(4, 'fail_content')).toBe(4)
    expect(nextHintLevel(2, 'pass_content_good_fluency')).toBe(0)
  })

  it('keeps the same card on content failure and replays weak-fluency cards later', () => {
    const topic = normalizedTopics[0]
    const store = new SpacedRepetitionStore('test-review-store', createMemoryStorageAdapter())
    const controller = new AutoSessionController({
      topics: [topic],
      cardsByTopic: { [topic.id]: cardsByTopic[topic.id] ?? [] },
      reviewStore: store,
      mode: 'browser',
    })

    controller.startSession()
    const firstCard = controller.getSnapshot().currentCard

    expect(firstCard).toBeDefined()

    controller.applyEvaluation({
      status: 'fail_content',
      metrics,
      reasonCodes: ['content_below_threshold'],
    })

    const retrySnapshot = controller.getSnapshot()
    expect(retrySnapshot.phase).toBe('retry')
    expect(retrySnapshot.currentCard?.id).toBe(firstCard?.id)
    expect(retrySnapshot.currentCardState?.hintLevel).toBe(1)

    controller.continueAfterRetry()
    controller.applyEvaluation({
      status: 'pass_content_weak_fluency',
      metrics,
      reasonCodes: ['fluency_needs_replay'],
    })

    const afterWeakPass = controller.getSnapshot()
    expect(afterWeakPass.currentCard?.id).not.toBe(firstCard?.id)
    expect(afterWeakPass.queue?.entries.some((entry) => entry.card.id === firstCard?.id && entry.source === 'weak-replay')).toBe(true)
  })

  it('pauses the session when no speech is detected', () => {
    const topic = normalizedTopics[0]
    const store = new SpacedRepetitionStore('test-review-store-2', createMemoryStorageAdapter())
    const controller = new AutoSessionController({
      topics: [topic],
      cardsByTopic: { [topic.id]: cardsByTopic[topic.id] ?? [] },
      reviewStore: store,
      mode: 'browser',
    })

    controller.startSession()
    controller.applyEvaluation({
      status: 'no_speech_or_idle',
      metrics: {
        contentScore: 0,
        fluencyScore: 0,
        completenessScore: 0,
        keywordCoverage: 0,
      },
      reasonCodes: ['idle_or_empty_transcript'],
    })

    const pausedSnapshot = controller.getSnapshot()
    expect(pausedSnapshot.phase).toBe('paused')
    expect(pausedSnapshot.pauseReason).toBe('idle')
  })
})
