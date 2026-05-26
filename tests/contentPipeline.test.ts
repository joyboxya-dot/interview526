import { describe, expect, it } from 'vitest'
import rawInterviewScripts from '../src/data/interviewScripts.raw.txt?raw'
import { extractCards } from '../src/content/cardExtractor'
import { normalizeTopics } from '../src/content/scriptNormalizer'
import { topicOverrides } from '../src/data/topicOverrides'

describe('content pipeline', () => {
  it('normalizes the raw dataset into ordered topics', () => {
    const topics = normalizeTopics(rawInterviewScripts, topicOverrides)

    expect(topics).toHaveLength(9)
    expect(topics[0]?.question).toContain('improved work efficiency')
    expect(topics[0]?.orderedSegments.length).toBeGreaterThan(5)
    expect(topics[0]?.bridge[0]?.text).toContain('When I joined')
  })

  it('extracts short recall cards from normalized segments', () => {
    const topics = normalizeTopics(rawInterviewScripts, topicOverrides)
    const cards = extractCards(topics)

    expect(cards.length).toBeGreaterThan(50)
    expect(cards[0]).toMatchObject({
      id: `${topics[0]?.id}-card-1`,
      topicId: topics[0]?.id,
      type: 'bridge',
    })
    expect(cards[0]?.keywords.length).toBeGreaterThan(0)
    expect(cards[0]?.cloze).toContain('_')
    expect(cards.every((card) => card.answer.trim().split(/\s+/).filter(Boolean).length >= 3)).toBe(true)
  })
})
