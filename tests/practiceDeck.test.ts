import { describe, expect, it } from 'vitest'
import { buildAnswerDeck, buildSentenceDeck } from '../src/app/practiceDeck'
import { cardsByTopic, normalizedTopics } from '../src/data/loadDataset'

describe('practice decks', () => {
  it('builds a sentence deck from all extracted cards', () => {
    const deck = buildSentenceDeck(normalizedTopics, cardsByTopic)
    const totalCards = Object.values(cardsByTopic).reduce((sum, cards) => sum + cards.length, 0)

    expect(deck).toHaveLength(totalCards)
    expect(deck[0]?.stage).toBe('sentence')
    expect(deck[0]?.displayBody.length).toBeGreaterThan(0)
    expect(deck[0]?.displayBody).toBe('제가 국민연금 NPS 시스템 고도화 프로젝트에 합류했을 때')
    expect(deck[1]?.displayBody).toBe('운영 인력으로')
    expect(deck[0]?.ttsText.length).toBeGreaterThan(0)
  })

  it('builds one answer item per topic with a full-answer evaluator card', () => {
    const deck = buildAnswerDeck(normalizedTopics)

    expect(deck).toHaveLength(normalizedTopics.length)
    expect(deck[0]?.stage).toBe('answer')
    expect(deck[0]?.evaluationCard.answer).toContain('When I joined')
    expect(deck[0]?.displayTitle).toContain('Tell me about')
  })
})
