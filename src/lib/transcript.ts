export function extractRecognizedWords(transcript?: string): string[] {
  if (!transcript) {
    return []
  }

  return transcript
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
    .filter(Boolean)
}
