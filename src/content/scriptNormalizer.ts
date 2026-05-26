import { createCloze, extractKeywords, normalizeWhitespace, slugify } from '../lib/text'
import type {
  CardType,
  NormalizedSegment,
  NormalizedTopic,
  RawTopicBlock,
  TopicMetadataOverride,
} from './contentTypes'

const DEFAULT_QUESTION = 'Tell me about this experience.'
const DEFAULT_SUMMARY = '주요 상황, 행동, 결과를 짧은 카드로 회상하도록 연습하는 토픽입니다.'

const GLUE_MARKERS = [
  'as a result',
  'in the end',
  'thanks to',
  'now that',
  'based on these findings',
]

const FILLER_MARKERS = [
  'but',
  'however',
  'so',
  'then',
  'also',
  'for example',
  'most importantly',
  'in practice',
  'specifically',
]

const MIN_SEGMENT_WORDS = 3

function isEnglishParagraph(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

function classifySegment(text: string, index: number, total: number): CardType {
  const normalized = text.toLowerCase()

  if (GLUE_MARKERS.some((marker) => normalized.startsWith(marker))) {
    return 'glue'
  }

  if (FILLER_MARKERS.some((marker) => normalized.startsWith(marker))) {
    return 'filler'
  }

  if (index === total - 1) {
    return 'glue'
  }

  if (index <= 1) {
    return 'bridge'
  }

  return 'body'
}

export function parseRawTopicBlocks(rawText: string): RawTopicBlock[] {
  const blocks = rawText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, index) => {
    const lines = block
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)

    const [sourceTitle, koreanNarrative, englishSegmentedAnswer] = lines

    if (!sourceTitle || !koreanNarrative || !englishSegmentedAnswer) {
      throw new Error(`Malformed dataset block near topic ${index + 1}`)
    }

    if (!isEnglishParagraph(englishSegmentedAnswer)) {
      throw new Error(`Expected English answer block for topic "${sourceTitle}"`)
    }

    return {
      sourceTitle,
      koreanNarrative,
      englishSegmentedAnswer,
    }
  })
}

function createSegments(topicId: string, englishSegmentedAnswer: string): NormalizedSegment[] {
  const rawSegments = englishSegmentedAnswer
    .split('/')
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean)

  const mergedSegments = mergeShortSegments(rawSegments, MIN_SEGMENT_WORDS)

  return mergedSegments.map((text, index) => {
    const keywords = extractKeywords(text)

    return {
      id: `${topicId}-segment-${index + 1}`,
      topicId,
      order: index,
      type: classifySegment(text, index, mergedSegments.length),
      text,
      keywords,
      cloze: createCloze(text, keywords.slice(0, 1)),
    }
  })
}

function mergeShortSegments(segments: string[], minWords: number): string[] {
  const merged: string[] = []
  let buffer = ''

  for (const segment of segments) {
    buffer = buffer ? `${buffer} ${segment}` : segment

    if (countWords(buffer) >= minWords) {
      merged.push(normalizeWhitespace(buffer))
      buffer = ''
    }
  }

  if (buffer) {
    if (merged.length === 0) {
      merged.push(normalizeWhitespace(buffer))
    } else {
      merged[merged.length - 1] = normalizeWhitespace(`${merged[merged.length - 1]} ${buffer}`)
    }
  }

  return merged.reduce<string[]>((accumulator, segment) => {
    if (accumulator.length === 0) {
      accumulator.push(segment)
      return accumulator
    }

    const previous = accumulator[accumulator.length - 1]
    if (countWords(previous) < minWords) {
      accumulator[accumulator.length - 1] = normalizeWhitespace(`${previous} ${segment}`)
      return accumulator
    }

    accumulator.push(segment)
    return accumulator
  }, [])
}

function countWords(value: string): number {
  return normalizeWhitespace(value).split(/\s+/).filter(Boolean).length
}

export function normalizeTopics(
  rawText: string,
  overrides: Record<string, TopicMetadataOverride> = {},
): NormalizedTopic[] {
  const blocks = parseRawTopicBlocks(rawText)

  return blocks.map((block, originalIndex) => {
    const id = slugify(block.sourceTitle)
    const metadata = overrides[id]
    const orderedSegments = createSegments(id, block.englishSegmentedAnswer)

    return {
      id,
      title: block.sourceTitle,
      question: metadata?.question ?? DEFAULT_QUESTION,
      altQuestion: metadata?.altQuestion,
      topicKor: metadata?.topicKor ?? block.sourceTitle,
      summaryKo: metadata?.summaryKo ?? DEFAULT_SUMMARY,
      bridge: orderedSegments.filter((segment) => segment.type === 'bridge'),
      bridgeKo: metadata?.summaryKo,
      body: orderedSegments.filter((segment) => segment.type === 'body'),
      filler: orderedSegments.filter((segment) => segment.type === 'filler'),
      glue: orderedSegments.filter((segment) => segment.type === 'glue'),
      orderedSegments,
      rawKoreanNarrative: block.koreanNarrative,
      rawEnglishAnswer: block.englishSegmentedAnswer,
      sourceMeta: {
        sourceTitle: block.sourceTitle,
        originalIndex,
      },
    }
  })
}
