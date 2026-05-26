import type { TopicCard } from '../content/contentTypes'
import type { QueueEntry, SessionQueueState } from './sessionTypes'

export function createSessionQueue(topicOrder: string[], cardsByTopic: Record<string, TopicCard[]>): SessionQueueState {
  const entries = topicOrder.flatMap<QueueEntry>((topicId) =>
    (cardsByTopic[topicId] ?? []).map((card) => ({
      card,
      source: 'main',
    })),
  )

  return {
    entries,
    currentIndex: 0,
  }
}

export function getCurrentEntry(queue: SessionQueueState): QueueEntry | undefined {
  return queue.entries[queue.currentIndex]
}

export function advanceQueue(queue: SessionQueueState): SessionQueueState {
  return {
    ...queue,
    currentIndex: queue.currentIndex + 1,
  }
}

export function scheduleWeakReplay(
  queue: SessionQueueState,
  card: TopicCard,
  spacing = 2,
): SessionQueueState {
  const insertAt = Math.min(queue.entries.length, queue.currentIndex + spacing + 2)
  const replayEntry: QueueEntry = {
    card,
    source: 'weak-replay',
  }

  return {
    ...queue,
    entries: [...queue.entries.slice(0, insertAt), replayEntry, ...queue.entries.slice(insertAt)],
  }
}

export function hasRemainingCards(queue: SessionQueueState): boolean {
  return queue.currentIndex < queue.entries.length
}
