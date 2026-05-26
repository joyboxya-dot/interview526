const STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'me',
  'more',
  'most',
  'my',
  'of',
  'on',
  'or',
  'our',
  'so',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'through',
  'to',
  'up',
  'us',
  'was',
  'we',
  'were',
  'what',
  'when',
  'while',
  'with',
  'would',
  'you',
  'your',
])

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeEnglish(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .filter(Boolean)
}

export function extractKeywords(value: string, maxKeywords = 5): string[] {
  const seen = new Set<string>()

  return tokenizeEnglish(value)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .filter((token) => {
      if (seen.has(token)) {
        return false
      }
      seen.add(token)
      return true
    })
    .slice(0, maxKeywords)
}

export function createCloze(value: string, revealedKeywords: string[] = []): string {
  const revealSet = new Set(revealedKeywords.map((keyword) => keyword.toLowerCase()))

  return value.replace(/\b([A-Za-z][A-Za-z'-]{2,})\b/g, (token) => {
    const lower = token.toLowerCase()

    if (STOP_WORDS.has(lower) || revealSet.has(lower)) {
      return token
    }

    return `${token[0]}${'_'.repeat(Math.max(2, token.length - 1))}`
  })
}

export function shuffleArray<T>(items: T[], random = Math.random): T[] {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }

  return copy
}
