import type { EvaluatorAdapter, EvaluatorRequest } from './evaluatorTypes'

export class AzureEvaluatorClient implements EvaluatorAdapter {
  readonly id = 'azure' as const

  async evaluate(request: EvaluatorRequest) {
    const response = await fetch('/api/evaluate/azure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card: request.card,
        topic: {
          id: request.topic.id,
          title: request.topic.title,
          question: request.topic.question,
        },
        hintLevel: request.hintLevel,
        turn: request.turn,
      }),
    })

    if (!response.ok) {
      throw new Error('Azure evaluator request failed')
    }

    return response.json()
  }
}
