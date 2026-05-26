import type { TopicCard } from '../content/contentTypes'
import type { EvaluationStatus } from '../speech/evaluatorTypes'
import { createBrowserStorageAdapter, type StorageAdapter } from './storageAdapter'

export interface ReviewRecord {
  cardId: string
  topicId: string
  ease: number
  dueAt: number
  lastStatus: EvaluationStatus | 'new'
  weakFluencyCount: number
  failCount: number
  updatedAt: number
}

export interface ReviewStoreSnapshot {
  [cardId: string]: ReviewRecord
}

export class SpacedRepetitionStore {
  private readonly storageKey: string
  private readonly storage: StorageAdapter | undefined

  constructor(
    storageKey = 'recall-speaking-trainer/review-store',
    storage: StorageAdapter | undefined = createBrowserStorageAdapter(),
  ) {
    this.storageKey = storageKey
    this.storage = storage
  }

  getAll(): ReviewStoreSnapshot {
    if (!this.storage) {
      return {}
    }

    const raw = this.storage.getItem(this.storageKey)
    if (!raw) {
      return {}
    }

    try {
      return JSON.parse(raw) as ReviewStoreSnapshot
    } catch {
      return {}
    }
  }

  get(cardId: string): ReviewRecord | undefined {
    return this.getAll()[cardId]
  }

  isTopicDue(topicId: string, cards: TopicCard[], now = Date.now()): boolean {
    return cards.some((card) => {
      const record = this.get(card.id)
      return !record || record.topicId === topicId && record.dueAt <= now
    })
  }

  applyOutcome(card: TopicCard, outcome: EvaluationStatus, now = Date.now()): ReviewRecord {
    const snapshot = this.getAll()
    const existing = snapshot[card.id]

    const baseEase = existing?.ease ?? 1
    const updated: ReviewRecord = {
      cardId: card.id,
      topicId: card.topicId,
      ease: nextEase(baseEase, outcome),
      dueAt: nextDueAt(existing?.dueAt ?? now, outcome, now),
      lastStatus: outcome,
      weakFluencyCount:
        (existing?.weakFluencyCount ?? 0) + (outcome === 'pass_content_weak_fluency' ? 1 : 0),
      failCount: (existing?.failCount ?? 0) + (outcome === 'fail_content' ? 1 : 0),
      updatedAt: now,
    }

    snapshot[card.id] = updated
    this.persist(snapshot)
    return updated
  }

  clear(): void {
    this.storage?.removeItem(this.storageKey)
  }

  private persist(snapshot: ReviewStoreSnapshot): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(snapshot))
  }
}

function nextEase(currentEase: number, outcome: EvaluationStatus): number {
  switch (outcome) {
    case 'pass_content_good_fluency':
      return Math.min(3, currentEase + 0.25)
    case 'pass_content_weak_fluency':
      return Math.min(2.5, currentEase + 0.05)
    case 'fail_content':
      return Math.max(0.8, currentEase - 0.2)
    case 'no_speech_or_idle':
      return currentEase
  }
}

function nextDueAt(previousDueAt: number, outcome: EvaluationStatus, now: number): number {
  const base = Math.max(previousDueAt, now)

  switch (outcome) {
    case 'pass_content_good_fluency':
      return base + 1000 * 60 * 60 * 24 * 2
    case 'pass_content_weak_fluency':
      return base + 1000 * 60 * 60 * 12
    case 'fail_content':
      return now + 1000 * 60 * 30
    case 'no_speech_or_idle':
      return now + 1000 * 60 * 10
  }
}
