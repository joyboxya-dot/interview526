import type { NormalizedTopic, TopicCard } from '../content/contentTypes'
import { shuffleArray } from '../lib/text'
import { SpacedRepetitionStore } from '../storage/spacedRepetitionStore'

export interface PlannedTopicRun {
  topicOrder: string[]
  cardsByTopic: Record<string, TopicCard[]>
}

export function planTopicRun(
  topics: NormalizedTopic[],
  cardsByTopic: Record<string, TopicCard[]>,
  reviewStore: SpacedRepetitionStore,
): PlannedTopicRun {
  const dueTopics = topics.filter((topic) =>
    reviewStore.isTopicDue(topic.id, cardsByTopic[topic.id] ?? []),
  )

  const selectedTopics = dueTopics.length > 0 ? dueTopics : topics
  const randomizedTopics = shuffleArray(selectedTopics)

  return {
    topicOrder: randomizedTopics.map((topic) => topic.id),
    cardsByTopic,
  }
}
