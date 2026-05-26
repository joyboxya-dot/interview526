import type { NormalizedTopic, TopicCard } from '../content/contentTypes'
import { MAX_HINT_LEVEL, nextHintLevel } from './hintEngine'
import {
  advanceQueue,
  createSessionQueue,
  getCurrentEntry,
  hasRemainingCards,
  scheduleWeakReplay,
} from './sessionQueue'
import type { SessionCardState, SessionSnapshot } from './sessionTypes'
import { planTopicRun } from './topicRunPlanner'
import { SpacedRepetitionStore } from '../storage/spacedRepetitionStore'
import type { EvaluationOutcome, EvaluatorMode } from '../speech/evaluatorTypes'

type Listener = (snapshot: SessionSnapshot) => void

interface AutoSessionControllerOptions {
  topics: NormalizedTopic[]
  cardsByTopic: Record<string, TopicCard[]>
  reviewStore: SpacedRepetitionStore
  mode: EvaluatorMode
}

export class AutoSessionController {
  private readonly listeners = new Set<Listener>()
  private readonly topicById: Record<string, NormalizedTopic>
  private state: SessionSnapshot
  private readonly options: AutoSessionControllerOptions

  constructor(options: AutoSessionControllerOptions) {
    this.options = options
    this.topicById = options.topics.reduce<Record<string, NormalizedTopic>>((accumulator, topic) => {
      accumulator[topic.id] = topic
      return accumulator
    }, {})

    this.state = {
      phase: 'idle',
      mode: options.mode,
      topicOrder: [],
      topicById: this.topicById,
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): SessionSnapshot {
    return this.state
  }

  setMode(mode: EvaluatorMode): void {
    this.update({
      ...this.state,
      mode,
    })
  }

  startSession(): void {
    const plannedRun = planTopicRun(
      this.options.topics,
      this.options.cardsByTopic,
      this.options.reviewStore,
    )

    const queue = createSessionQueue(plannedRun.topicOrder, plannedRun.cardsByTopic)
    const currentCard = getCurrentEntry(queue)?.card

    this.update({
      phase: currentCard ? 'priming' : 'completed',
      mode: this.state.mode,
      topicOrder: plannedRun.topicOrder,
      topicById: this.topicById,
      queue,
      currentCard,
      currentTopic: currentCard ? this.topicById[currentCard.topicId] : undefined,
      currentCardState: currentCard ? createCardState(currentCard.id) : undefined,
      startedAt: Date.now(),
      completedAt: currentCard ? undefined : Date.now(),
      lastOutcome: undefined,
      pauseReason: undefined,
    })
  }

  markListening(): void {
    if (!this.state.currentCard) {
      return
    }

    this.update({
      ...this.state,
      phase: 'listening',
    })
  }

  markEvaluating(): void {
    if (!this.state.currentCard) {
      return
    }

    this.update({
      ...this.state,
      phase: 'evaluating',
    })
  }

  revealNextHint(): void {
    if (!this.state.currentCardState) {
      return
    }

    this.update({
      ...this.state,
      currentCardState: {
        ...this.state.currentCardState,
        hintLevel: Math.min(MAX_HINT_LEVEL, this.state.currentCardState.hintLevel + 1),
      },
    })
  }

  continueAfterRetry(): void {
    if (this.state.phase !== 'retry' || !this.state.currentCard) {
      return
    }

    this.update({
      ...this.state,
      phase: 'priming',
    })
  }

  pause(reason: 'manual' | 'idle'): void {
    if (!this.state.currentCard) {
      return
    }

    this.update({
      ...this.state,
      phase: 'paused',
      pauseReason: reason,
    })
  }

  resume(): void {
    if (this.state.phase !== 'paused' || !this.state.currentCard) {
      return
    }

    this.update({
      ...this.state,
      phase: 'priming',
      pauseReason: undefined,
    })
  }

  endSession(): void {
    this.update({
      ...this.state,
      phase: 'completed',
      completedAt: Date.now(),
    })
  }

  applyEvaluation(outcome: EvaluationOutcome): void {
    const { currentCard, currentCardState, queue } = this.state

    if (!currentCard || !currentCardState || !queue) {
      return
    }

    this.options.reviewStore.applyOutcome(currentCard, outcome.status)

    if (outcome.status === 'no_speech_or_idle') {
      this.update({
        ...this.state,
        phase: 'paused',
        pauseReason: 'idle',
        lastOutcome: outcome,
      })
      return
    }

    if (outcome.status === 'fail_content') {
      this.update({
        ...this.state,
        phase: 'retry',
        lastOutcome: outcome,
        currentCardState: {
          ...currentCardState,
          hintLevel: nextHintLevel(currentCardState.hintLevel, outcome.status),
          attemptCount: currentCardState.attemptCount + 1,
          lastOutcome: outcome.status,
        },
      })
      return
    }

    const replayQueue =
      outcome.status === 'pass_content_weak_fluency' &&
      !currentCardState.weakFluencyReplayPlanned
        ? scheduleWeakReplay(queue, currentCard)
        : queue

    const nextQueue = advanceQueue(replayQueue)
    const nextCard = getCurrentEntry(nextQueue)?.card

    this.update({
      ...this.state,
      phase: nextCard ? 'priming' : 'completed',
      queue: nextQueue,
      currentCard: nextCard,
      currentTopic: nextCard ? this.topicById[nextCard.topicId] : undefined,
      currentCardState: nextCard
        ? createCardState(nextCard.id)
        : undefined,
      lastOutcome: outcome,
      completedAt: nextCard ? undefined : Date.now(),
    })
  }

  hasRemainingCards(): boolean {
    return this.state.queue ? hasRemainingCards(this.state.queue) : false
  }

  private update(nextState: SessionSnapshot): void {
    this.state = nextState
    this.listeners.forEach((listener) => listener(this.state))
  }
}

function createCardState(cardId: string): SessionCardState {
  return {
    cardId,
    hintLevel: 0,
    attemptCount: 0,
    weakFluencyReplayPlanned: false,
  }
}
