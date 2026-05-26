import { scoreTurnHeuristically } from './browserHeuristics'
import type { EvaluatorAdapter, EvaluatorRequest } from './evaluatorTypes'

export class BrowserEvaluator implements EvaluatorAdapter {
  readonly id = 'browser' as const

  async evaluate(request: EvaluatorRequest) {
    return scoreTurnHeuristically(request.card, request.turn)
  }
}
