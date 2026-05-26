import type { NormalizedTopic, TopicCard } from '../content/contentTypes'
import { createCloze, extractKeywords, normalizeWhitespace } from '../lib/text'
import { sentenceChunkOverrides } from '../data/sentenceChunkOverrides'

export type PracticeStage = 'sentence' | 'answer'

export interface PracticeItem {
  id: string
  stage: PracticeStage
  topic: NormalizedTopic
  evaluationCard: TopicCard
  ttsText: string
  displayTitle: string
  displayBody: string
  displayMeta: string
}

export function buildSentenceDeck(
  topics: NormalizedTopic[],
  cardsByTopic: Record<string, TopicCard[]>,
): PracticeItem[] {
  return topics.flatMap((topic) =>
    (cardsByTopic[topic.id] ?? []).map((card) => ({
      id: `sentence-${card.id}`,
      stage: 'sentence',
      topic,
      evaluationCard: card,
      ttsText: card.answer,
      displayTitle: topic.title,
      displayBody: card.answerKo ?? buildSentenceMeaning(topic, card),
      displayMeta: `${topic.topicKor} · ${card.type}`,
    })),
  )
}

export function buildAnswerDeck(topics: NormalizedTopic[]): PracticeItem[] {
  return topics.map((topic) => {
    const fullAnswer = normalizeWhitespace(topic.orderedSegments.map((segment) => segment.text).join(' '))
    const keywords = extractKeywords(fullAnswer, 8)
    const evaluationCard: TopicCard = {
      id: `${topic.id}-full-answer`,
      topicId: topic.id,
      type: 'body',
      order: 0,
      prompt: topic.question,
      answer: fullAnswer,
      answerKo: topic.summaryKo,
      keywords,
      cloze: createCloze(fullAnswer, keywords.slice(0, 2)),
    }

    return {
      id: `answer-${topic.id}`,
      stage: 'answer',
      topic,
      evaluationCard,
      ttsText: topic.question,
      displayTitle: topic.question,
      displayBody: topic.summaryKo,
      displayMeta: topic.title,
    }
  })
}

function buildSentenceMeaning(topic: NormalizedTopic, card: TopicCard): string {
  const overrideChunks = sentenceChunkOverrides[topic.id]

  if (overrideChunks && overrideChunks.length > 0) {
    const alignedOverrideChunks = alignMeaningOverrides(overrideChunks, topic.orderedSegments.length)
    return alignedOverrideChunks[Math.min(card.order, alignedOverrideChunks.length - 1)] ?? topic.summaryKo
  }

  const koreanChunks = buildKoreanChunks(topic.rawKoreanNarrative, topic.orderedSegments.length)

  if (koreanChunks.length === 0) {
    return topic.summaryKo
  }

  const chunkIndex = Math.min(
    koreanChunks.length - 1,
    Math.floor((card.order / Math.max(1, topic.orderedSegments.length)) * koreanChunks.length),
  )

  return koreanChunks[chunkIndex] ?? topic.summaryKo
}

function alignMeaningOverrides(chunks: string[], targetCount: number): string[] {
  const normalizedChunks = chunks.map((chunk) => normalizeWhitespace(chunk)).filter(Boolean)

  if (normalizedChunks.length === 0 || targetCount <= 0) {
    return []
  }

  if (normalizedChunks.length <= targetCount) {
    return normalizedChunks
  }

  const buckets = Array.from({ length: targetCount }, () => [] as string[])

  normalizedChunks.forEach((chunk, index) => {
    const bucketIndex = Math.min(targetCount - 1, Math.floor((index * targetCount) / normalizedChunks.length))
    buckets[bucketIndex]?.push(chunk)
  })

  return buckets.map((bucket) => normalizeWhitespace(bucket.join(' '))).filter(Boolean)
}

function splitKoreanNarrative(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+|,\s*|(?=하지만)|(?=그 결과)|(?=또한)|(?=그리고)|(?=그런 다음)|(?=이 과정에서)|(?=가장 중요한 것은)|(?=이런 프로젝트들을 통해)|(?=이를 극복하기 위해)/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)
}

function buildKoreanChunks(value: string, targetCount: number): string[] {
  const initialChunks = splitKoreanNarrative(value).flatMap((chunk) => splitOversizedChunk(chunk))
  const normalizedChunks = initialChunks.map((chunk) => normalizeWhitespace(chunk)).filter(Boolean)

  if (normalizedChunks.length === 0) {
    return []
  }

  const expandedChunks = [...normalizedChunks]

  while (expandedChunks.length < targetCount) {
    const splitIndex = findLongestSplittableChunkIndex(expandedChunks)

    if (splitIndex < 0) {
      break
    }

    const [chunk] = expandedChunks.splice(splitIndex, 1)
    expandedChunks.splice(splitIndex, 0, ...splitChunkInHalf(chunk))
  }

  return expandedChunks
}

function splitOversizedChunk(value: string, maxLength = 30, maxWords = 6): string[] {
  if (value.length <= maxLength) {
    return [value]
  }

  const words = value.split(/\s+/).filter(Boolean)

  if (words.length < 2) {
    return [value]
  }

  const chunks: string[] = []
  let currentWords: string[] = []

  for (const word of words) {
    const nextWords = [...currentWords, word]
    const nextText = nextWords.join(' ')

    if (currentWords.length > 0 && (nextText.length > maxLength || currentWords.length >= maxWords)) {
      chunks.push(currentWords.join(' '))
      currentWords = [word]
      continue
    }

    currentWords = nextWords
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '))
  }

  return chunks
}

function splitChunkInHalf(value: string): string[] {
  const words = value.split(/\s+/).filter(Boolean)

  if (words.length < 2) {
    return [value]
  }

  const middle = Math.ceil(words.length / 2)

  return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')].filter(Boolean)
}

function findLongestSplittableChunkIndex(chunks: string[]): number {
  let selectedIndex = -1
  let selectedLength = 0

  chunks.forEach((chunk, index) => {
    if (chunk.split(/\s+/).filter(Boolean).length < 2) {
      return
    }

    if (chunk.length > selectedLength) {
      selectedLength = chunk.length
      selectedIndex = index
    }
  })

  return selectedIndex
}
