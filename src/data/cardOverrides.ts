export interface CardOverride {
  prompt?: string
  answerKo?: string
  keywords?: string[]
}

export const cardOverrides: Record<string, CardOverride> = {}
