export interface SpeechRecognitionHandle {
  start(): void
  stop(): Promise<string>
  dispose(): void
  getTranscript(): string
}

export function createSpeechRecognitionHandle(language = 'en-US'): SpeechRecognitionHandle | undefined {
  const SpeechRecognitionCtor =
    window.SpeechRecognition ?? window.webkitSpeechRecognition

  if (!SpeechRecognitionCtor) {
    return undefined
  }

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = language
  recognition.continuous = true
  recognition.interimResults = true

  let transcript = ''
  let stopResolver: ((transcript: string) => void) | undefined
  let stopTimeoutId = 0

  const resolveStop = () => {
    if (!stopResolver) {
      return
    }

    const resolver = stopResolver
    stopResolver = undefined
    if (stopTimeoutId) {
      window.clearTimeout(stopTimeoutId)
      stopTimeoutId = 0
    }
    resolver(transcript)
  }

  recognition.onresult = (event) => {
    const combined = Array.from(event.results)
      .map((result) => result[0]?.transcript ?? '')
      .join(' ')

    transcript = combined.trim()
  }

  recognition.onend = () => {
    resolveStop()
  }

  recognition.onerror = () => {
    resolveStop()
  }

  return {
    start() {
      recognition.start()
    },
    stop() {
      return new Promise<string>((resolve) => {
        stopResolver = resolve

        try {
          recognition.stop()
        } catch {
          resolveStop()
          return
        }

        stopTimeoutId = window.setTimeout(() => {
          try {
            recognition.abort()
          } catch {
            // Ignore follow-up abort errors.
          }
          resolveStop()
        }, 1200)
      })
    },
    dispose() {
      if (stopResolver) {
        resolveStop()
      }
      recognition.abort()
    },
    getTranscript() {
      return transcript
    },
  }
}
