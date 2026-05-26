import rawInterviewScripts from './interviewScripts.raw.txt?raw'
import { extractCards, groupCardsByTopic } from '../content/cardExtractor'
import { normalizeTopics } from '../content/scriptNormalizer'
import { topicOverrides } from './topicOverrides'
import { cardOverrides } from './cardOverrides'

export const normalizedTopics = normalizeTopics(rawInterviewScripts, topicOverrides)
export const topicCards = extractCards(normalizedTopics, cardOverrides)
export const cardsByTopic = groupCardsByTopic(topicCards)
