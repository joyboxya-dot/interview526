import { describe, expect, it } from 'vitest'
import { extractRecognizedWords } from '../src/lib/transcript'

describe('extractRecognizedWords', () => {
  it('returns an empty array when transcript is empty', () => {
    expect(extractRecognizedWords('')).toEqual([])
    expect(extractRecognizedWords('   ')).toEqual([])
    expect(extractRecognizedWords(undefined)).toEqual([])
  })

  it('keeps only recognized word tokens', () => {
    expect(extractRecognizedWords('When, I joined the project.')).toEqual([
      'When',
      'I',
      'joined',
      'the',
      'project',
    ])
  })
})
