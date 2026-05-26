export type CardType = 'bridge' | 'body' | 'filler' | 'glue'

export interface RawTopicBlock {
  sourceTitle: string
  koreanNarrative: string
  englishSegmentedAnswer: string
}

export interface TopicMetadataOverride {
  question?: string
  altQuestion?: string
  topicKor?: string
  summaryKo?: string
}

export interface NormalizedSegment {
  id: string
  topicId: string
  order: number
  type: CardType
  text: string
  keywords: string[]
  cloze: string
}

export interface NormalizedTopic {
  id: string
  title: string
  question: string
  altQuestion?: string
  topicKor: string
  summaryKo: string
  bridge: NormalizedSegment[]
  bridgeKo?: string
  body: NormalizedSegment[]
  filler: NormalizedSegment[]
  glue: NormalizedSegment[]
  orderedSegments: NormalizedSegment[]
  rawKoreanNarrative: string
  rawEnglishAnswer: string
  sourceMeta: {
    sourceTitle: string
    originalIndex: number
  }
}

export interface TopicCard {
  id: string
  topicId: string
  type: CardType
  order: number
  prompt: string
  answer: string
  answerKo?: string
  keywords: string[]
  cloze: string
}
