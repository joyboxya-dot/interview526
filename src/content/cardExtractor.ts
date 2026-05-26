import type { TopicCard, NormalizedTopic } from './contentTypes'
import type { CardOverride } from '../data/cardOverrides'

const TYPE_LABELS: Record<TopicCard['type'], string> = {
  bridge: 'Set the scene',
  body: 'Recall the core point',
  filler: 'Add the connector',
  glue: 'Close the answer',
}

export function extractCards(
  topics: NormalizedTopic[],
  overrides: Record<string, CardOverride> = {},
): TopicCard[] {
  return topics.flatMap((topic) =>
    topic.orderedSegments.map((segment, index) => {
      const cardId = `${topic.id}-card-${index + 1}`
      const override = overrides[cardId]

      return {
        id: cardId,
        topicId: topic.id,
        type: segment.type,
        order: index,
        prompt:
          override?.prompt ?? `${TYPE_LABELS[segment.type]} ${index + 1}/${topic.orderedSegments.length}`,
        answer: segment.text,
        answerKo: override?.answerKo,
        keywords: override?.keywords ?? segment.keywords,
        cloze: segment.cloze,
      }
    }),
  )
}

export function groupCardsByTopic(cards: TopicCard[]): Record<string, TopicCard[]> {
  return cards.reduce<Record<string, TopicCard[]>>((accumulator, card) => {
    accumulator[card.topicId] ??= []
    accumulator[card.topicId].push(card)
    accumulator[card.topicId].sort((left, right) => left.order - right.order)
    return accumulator
  }, {})
}
