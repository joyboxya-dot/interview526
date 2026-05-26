import type { NormalizedTopic, TopicCard } from '../content/contentTypes'
import type { EvaluationOutcome, EvaluationStatus, EvaluatorMode } from '../speech/evaluatorTypes'

export type SessionPhase =
  | 'idle'
  | 'priming'
  | 'listening'
  | 'evaluating'
  | 'retry'
  | 'paused'
  | 'completed'

export interface QueueEntry {
  card: TopicCard
  source: 'main' | 'weak-replay'
}

export interface SessionQueueState {
  entries: QueueEntry[]
  currentIndex: number
}

export interface SessionCardState {
  cardId: string
  hintLevel: number
  attemptCount: number
  lastOutcome?: EvaluationStatus
  weakFluencyReplayPlanned: boolean
}

export interface SessionSnapshot {
  phase: SessionPhase
  mode: EvaluatorMode
  topicOrder: string[]
  topicById: Record<string, NormalizedTopic>
  queue?: SessionQueueState
  currentCard?: TopicCard
  currentTopic?: NormalizedTopic
  currentCardState?: SessionCardState
  lastOutcome?: EvaluationOutcome
  pauseReason?: 'manual' | 'idle'
  startedAt?: number
  completedAt?: number
}
