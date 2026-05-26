import type { SpeechTurnResult } from '../speech/evaluatorTypes'
import { createSpeechRecognitionHandle } from '../speech/speechRecognitionAdapter'
import { blobToBase64, calculateRms, encodeWav, mergeChunks } from '../speech/vad'

export interface CaptureTurnOptions {
  language?: string
  maxIdleMs?: number
  trailingSilenceMs?: number
  maxTurnMs?: number
  speechThreshold?: number
  stopOnSilence?: boolean
}

export class SpeechTurnController {
  private audioContext?: AudioContext

  async primeAudioContext(): Promise<void> {
    const audioContext = this.getOrCreateAudioContext()

    if (audioContext.state !== 'running') {
      await audioContext.resume()
    }

    if (audioContext.state !== 'running') {
      throw new Error('브라우저가 마이크 오디오 처리를 시작하지 못했습니다. 세션 시작을 다시 눌러 주세요.')
    }
  }

  async captureTurn(
    {
      language = 'en-US',
      maxIdleMs = 5_000,
      trailingSilenceMs = 1_600,
      maxTurnMs = 25_000,
      speechThreshold = 0.04,
      stopOnSilence = true,
    }: CaptureTurnOptions = {},
    signal?: AbortSignal,
  ): Promise<SpeechTurnResult> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const audioContext = this.getOrCreateAudioContext()

    if (audioContext.state !== 'running') {
      try {
        await audioContext.resume()
      } catch {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error('브라우저가 녹음을 시작하지 못했습니다. 세션 시작을 다시 눌러 주세요.')
      }
    }

    if (audioContext.state !== 'running') {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error('브라우저가 녹음을 시작하지 못했습니다. 세션 시작을 다시 눌러 주세요.')
    }

    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    const silentGain = audioContext.createGain()
    const recognition = createSpeechRecognitionHandle(language)
    const pcmChunks: Float32Array[] = []
    const timeData = new Uint8Array(analyser.fftSize)
    const startedAt = performance.now()

    let settled = false
    let speechStartedAt: number | undefined
    let lastSpeechAt: number | undefined
    let intervalId = 0
    let maxTurnTimeoutId = 0
    let noiseFloor = 0.004
    let calibrationSamples = 0
    let activeFrames = 0
    let detectedSpeechMs = 0

    analyser.fftSize = 2048
    silentGain.gain.value = 0

    source.connect(analyser)
    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioContext.destination)

    processor.onaudioprocess = (event) => {
      pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    }

    try {
      recognition?.start()
    } catch {
      recognition?.dispose()
    }

    return new Promise<SpeechTurnResult>((resolve, reject) => {
      const finish = async (status: 'captured' | 'idle') => {
        if (settled) {
          return
        }

        settled = true
        window.clearInterval(intervalId)
        window.clearTimeout(maxTurnTimeoutId)

        const transcript = await (async () => {
          try {
            return (await recognition?.stop()) ?? recognition?.getTranscript() ?? ''
          } catch {
            recognition?.dispose()
            return recognition?.getTranscript() ?? ''
          }
        })()
        processor.onaudioprocess = null
        processor.disconnect()
        silentGain.disconnect()
        source.disconnect()
        stream.getTracks().forEach((track) => track.stop())

        const merged = mergeChunks(pcmChunks)
        const wav = encodeWav(merged, audioContext.sampleRate)

        resolve({
          status,
          transcript,
          audioBase64: merged.length > 0 ? await blobToBase64(wav) : undefined,
          mimeType: 'audio/wav',
          metrics: {
            leadInMs: speechStartedAt ? Math.round(speechStartedAt - startedAt) : maxIdleMs,
            speechDurationMs:
              speechStartedAt && lastSpeechAt ? Math.max(0, Math.round(lastSpeechAt - speechStartedAt)) : 0,
            detectedSpeechMs,
            trailingSilenceMs:
              speechStartedAt && lastSpeechAt ? Math.round(performance.now() - lastSpeechAt) : 0,
            totalTurnMs: Math.round(performance.now() - startedAt),
          },
        })
      }

      const abort = async () => {
        if (settled) {
          return
        }

        settled = true
        window.clearInterval(intervalId)
        window.clearTimeout(maxTurnTimeoutId)
        processor.onaudioprocess = null
        processor.disconnect()
        silentGain.disconnect()
        source.disconnect()
        recognition?.dispose()
        stream.getTracks().forEach((track) => track.stop())
        reject(new DOMException('Turn capture aborted', 'AbortError'))
      }

      if (signal) {
        signal.addEventListener('abort', () => {
          void abort()
        })
      }

      maxTurnTimeoutId = window.setTimeout(() => {
        void finish(speechStartedAt ? 'captured' : 'idle')
      }, maxTurnMs)

      intervalId = window.setInterval(() => {
        analyser.getByteTimeDomainData(timeData)
        const rms = calculateRms(timeData)
        const now = performance.now()
        const transcriptSeen = (recognition?.getTranscript() ?? '').trim().length > 0

        if (!speechStartedAt && calibrationSamples < 10) {
          noiseFloor = (noiseFloor * calibrationSamples + rms) / (calibrationSamples + 1)
          calibrationSamples += 1
        }

        const dynamicThreshold = Math.max(speechThreshold, noiseFloor * 2.3, 0.008)

        if (rms >= dynamicThreshold) {
          activeFrames = Math.min(activeFrames + 1, 10)
        } else if (activeFrames > 0) {
          activeFrames -= 1
        }

        if (transcriptSeen || activeFrames >= 2) {
          speechStartedAt ??= now
          lastSpeechAt = now
        }

        if (activeFrames >= 2) {
          detectedSpeechMs += 100
        }

        if (!speechStartedAt && now - startedAt >= maxIdleMs) {
          void finish('idle')
          return
        }

        if (
          stopOnSilence &&
          speechStartedAt &&
          lastSpeechAt &&
          now - lastSpeechAt >= trailingSilenceMs
        ) {
          void finish('captured')
          return
        }

      }, 100)
    })
  }

  private getOrCreateAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext()
    }

    return this.audioContext
  }
}
