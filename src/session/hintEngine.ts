import type { NormalizedTopic, TopicCard } from '../content/contentTypes'
import type { EvaluationStatus } from '../speech/evaluatorTypes'

export interface HintPresentation {
  level: number
  label: string
  promptKo: string
  details: string[]
  canPlayModelAudio: boolean
}

export const MAX_HINT_LEVEL = 4

export function nextHintLevel(currentLevel: number, outcome?: EvaluationStatus): number {
  if (outcome === 'fail_content') {
    return Math.min(MAX_HINT_LEVEL, currentLevel + 1)
  }

  return 0
}

export function buildHint(topic: NormalizedTopic, card: TopicCard, level: number): HintPresentation {
  const safeLevel = Math.max(0, Math.min(MAX_HINT_LEVEL, level))
  const baseDetails = [
    `Question: ${topic.question}`,
    `Topic: ${topic.title}`,
    `Meaning: ${topic.summaryKo}`,
  ]

  switch (safeLevel) {
    case 0:
      return {
        level: 0,
        label: 'Hint 0 · Recall only',
        promptKo: `${card.prompt} · 먼저 영어 문장을 읽지 말고 떠올려 보세요.`,
        details: baseDetails,
        canPlayModelAudio: false,
      }
    case 1:
      return {
        level: 1,
        label: 'Hint 1 · Keywords',
        promptKo: `${card.prompt} · 핵심 단어만 보고 말해보세요.`,
        details: [...baseDetails, `Keywords: ${card.keywords.join(', ') || 'none'}`],
        canPlayModelAudio: false,
      }
    case 2:
      return {
        level: 2,
        label: 'Hint 2 · Cloze',
        promptKo: `${card.prompt} · 빠진 단어를 채운다고 생각하고 말해보세요.`,
        details: [...baseDetails, `Cloze: ${card.cloze}`],
        canPlayModelAudio: false,
      }
    case 3:
      return {
        level: 3,
        label: 'Hint 3 · Full sentence',
        promptKo: `${card.prompt} · 전체 문장을 보고 다시 회상해보세요.`,
        details: [...baseDetails, `Full: ${card.answer}`],
        canPlayModelAudio: false,
      }
    case 4:
      return {
        level: 4,
        label: 'Hint 4 · Full sentence + model audio',
        promptKo: `${card.prompt} · 필요하면 모범 음성을 들은 뒤 다시 말해보세요.`,
        details: [...baseDetails, `Full: ${card.answer}`],
        canPlayModelAudio: true,
      }
    default:
      return {
        level: 4,
        label: 'Hint 4 · Full sentence + model audio',
        promptKo: `${card.prompt} · 필요하면 모범 음성을 들은 뒤 다시 말해보세요.`,
        details: [...baseDetails, `Full: ${card.answer}`],
        canPlayModelAudio: true,
      }
  }
}
