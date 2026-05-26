import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAnswerDeck, buildSentenceDeck, type PracticeItem, type PracticeStage } from './practiceDeck'
import { normalizedTopics, cardsByTopic } from '../data/loadDataset'
import { createCloze, tokenizeEnglish } from '../lib/text'
import { extractRecognizedWords } from '../lib/transcript'
import { SpeechTurnController } from '../session/speechTurnController'
import { BrowserEvaluator } from '../speech/browserEvaluator'
import type { EvaluationOutcome, SpeechTurnResult } from '../speech/evaluatorTypes'

const NEXT_ITEM_DELAY_MS = 250
const RECOGNITION_REVIEW_MS = 700
const ANSWER_RECORDING_MS = 180_000
const SENTENCE_IDLE_MS = 4_000
const ANSWER_IDLE_MS = 7_000
const MIN_SENTENCE_RECORDING_MS = 2_500
const VOICE_PREVIEW_TEXT = 'Hello. This is a sample interview answer for voice preview.'
const SENTENCE_PREP_MS = 900
const ANSWER_PREP_MS = 1_500

type SessionPhase = 'idle' | 'prompting' | 'listening' | 'evaluating' | 'modeling' | 'result' | 'stopped'
type StopReason = 'idle' | 'noise' | 'permission' | 'error'
type QueueSource = 'base' | 'replay'

interface SessionView {
  phase: SessionPhase
  currentIndex: number
  currentQueueSource: QueueSource
  currentItem?: PracticeItem
  displayBodyOverride?: string
  hintLevel: number
  answerReplayQueue: PracticeItem[]
  lastPromptDurationMs: number
  listeningStartedAt?: number
  recordingTargetMs?: number
  lastTurn?: SpeechTurnResult
  lastOutcome?: EvaluationOutcome
  stopMessage?: string
  stopReason?: StopReason
}

interface VoiceOption {
  name: string
  label: string
}

interface VoiceRenderProfile {
  browserVoiceName?: string
  systemVoiceName?: string
  browserPitch: number
}

const EXCLUDED_VOICE_NAME_PARTS = [
  'bad news',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
]

const PREFERRED_ENGLISH_VOICE_NAMES = [
  'samantha',
  'alex',
  'daniel',
  'kathy',
  'sandy',
  'shelley',
  'eddy',
  'flo',
  'reed',
  'rocko',
  'moira',
  'karen',
  'tessa',
  'rishi',
  'aman',
  'tara',
]

const HIGH_TONE_FEMALE_VOICE_NAMES = ['samantha', 'kathy', 'sandy', 'shelley', 'karen', 'moira']

export function useRecallTrainer() {
  const [stage, setStageState] = useState<PracticeStage>('sentence')
  const [error, setError] = useState<string>()
  const [isRunning, setIsRunning] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([])
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>()
  const [clockMs, setClockMs] = useState(() => Date.now())
  const [session, setSession] = useState<SessionView>({
    phase: 'idle',
    currentIndex: 0,
    currentQueueSource: 'base',
    hintLevel: 0,
    answerReplayQueue: [],
    lastPromptDurationMs: 0,
  })

  const runTokenRef = useRef(0)
  const voicePreviewTokenRef = useRef(0)
  const activeAbortRef = useRef<AbortController | null>(null)
  const activePromptAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeRecordedAudioRef = useRef<HTMLAudioElement | null>(null)
  const turnController = useMemo(() => new SpeechTurnController(), [])
  const evaluator = useMemo(() => new BrowserEvaluator(), [])
  const sentenceDeck = useMemo(() => buildSentenceDeck(normalizedTopics, cardsByTopic), [])
  const answerDeck = useMemo(() => buildAnswerDeck(normalizedTopics), [])
  const currentDeck = stage === 'sentence' ? sentenceDeck : answerDeck
  const speechRecognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    let active = true

    const syncVoices = async () => {
      const voices = await loadSpeechVoices()
      if (!active) {
        return
      }

      const englishVoices = selectVoiceOptions(voices)

      setAvailableVoices(englishVoices)

      if (!selectedVoiceName && englishVoices.length > 0) {
        const preferredVoice = pickPreferredEnglishVoice(voices, 'en-US')
        setSelectedVoiceName(preferredVoice?.name ?? englishVoices[0]?.name)
      }
    }

    void syncVoices()

    const handleVoicesChanged = () => {
      void syncVoices()
    }

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)

    return () => {
      active = false
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
    }
  }, [selectedVoiceName])

  useEffect(() => {
    if (session.phase !== 'listening') {
      return
    }

    const intervalId = window.setInterval(() => {
      setClockMs(Date.now())
    }, 200)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [session.phase])

  useEffect(() => {
    if (!isRunning || session.phase !== 'prompting' || !session.currentItem) {
      return
    }

    const estimatedDuration = estimateSpeechDuration(session.currentItem.ttsText)
    const prepDelayMs = stage === 'sentence' ? SENTENCE_PREP_MS : ANSWER_PREP_MS
    const transitionId = window.setTimeout(() => {
      setSession((current) => ({
        ...current,
        phase: 'listening',
        displayBodyOverride: getPromptDisplayBody(
          session.currentItem,
          stage,
          current.hintLevel,
          current.lastTurn?.transcript,
        ),
        lastPromptDurationMs: estimatedDuration,
        listeningStartedAt: Date.now(),
        recordingTargetMs:
          stage === 'sentence'
            ? Math.max(MIN_SENTENCE_RECORDING_MS, Math.round(estimatedDuration * 1.5))
            : ANSWER_RECORDING_MS,
      }))
    }, prepDelayMs)

    return () => {
      window.clearTimeout(transitionId)
    }
  }, [isRunning, selectedVoiceName, session.currentItem, session.phase, stage])

  useEffect(() => {
    if (!isRunning || session.phase !== 'listening' || !session.currentItem) {
      return
    }

    const token = runTokenRef.current
    const abortController = new AbortController()
    activeAbortRef.current = abortController
    const currentItem = session.currentItem
    const currentIndex = session.currentIndex
    const recordingMs =
      stage === 'sentence'
        ? Math.max(MIN_SENTENCE_RECORDING_MS, Math.round(session.lastPromptDurationMs * 1.5))
        : ANSWER_RECORDING_MS
    const maxIdleMs = stage === 'sentence' ? SENTENCE_IDLE_MS : ANSWER_IDLE_MS

    void (async () => {
      try {
        const turn = await turnController.captureTurn(
          {
            language: 'en-US',
            maxTurnMs: recordingMs,
            maxIdleMs,
            speechThreshold: 0.02,
            stopOnSilence: false,
          },
          abortController.signal,
        )

        if (runTokenRef.current !== token) {
          return
        }

        if (turn.status === 'idle') {
          setSession((current) => ({
            ...current,
            phase: 'stopped',
            lastTurn: turn,
            stopReason: 'idle',
            stopMessage: '말이 감지되지 않아 세션이 멈췄습니다. 세션 시작을 다시 눌러 주세요.',
          }))
          setIsRunning(false)
          return
        }

        const resolvedTurn = await resolveTurnTranscript(turn, 'en-US')

        if (runTokenRef.current !== token) {
          return
        }

        const recognizedWords = extractRecognizedWords(resolvedTurn.transcript)
        const likelySpeechAudio = isLikelySpeechAudio(resolvedTurn)
        if (recognizedWords.length === 0 && !likelySpeechAudio) {
          setSession((current) => ({
            ...current,
            phase: 'stopped',
            lastTurn: resolvedTurn,
            stopReason: 'noise',
            listeningStartedAt: undefined,
            recordingTargetMs: undefined,
            stopMessage: '녹음본에서 말소리로 보기 어려워 세션이 멈췄습니다. 타자 소리나 짧은 잡음만 들어가면 여기서 멈춥니다.',
          }))
          setIsRunning(false)
          return
        }

        const outcome = await evaluator.evaluate({
          card: currentItem.evaluationCard,
          topic: currentItem.topic,
          hintLevel: session.hintLevel,
          turn: resolvedTurn,
        })

        if (runTokenRef.current !== token) {
          return
        }

        setSession((current) => ({
          ...current,
          phase: 'result',
          displayBodyOverride: getPromptDisplayBody(currentItem, stage, current.hintLevel, resolvedTurn.transcript),
          listeningStartedAt: undefined,
          recordingTargetMs: undefined,
          lastTurn: resolvedTurn,
          lastOutcome: outcome,
        }))

        let reviewedDuringPlayback = false

        try {
          await playRecordedTurn(resolvedTurn, activeRecordedAudioRef)
          reviewedDuringPlayback = true
        } catch (playbackError) {
          if (!(playbackError instanceof DOMException && playbackError.name === 'AbortError')) {
            // Ignore recorded playback failures and continue with transcript review.
          }
        }

        if (!reviewedDuringPlayback) {
          await delay(RECOGNITION_REVIEW_MS)
        }

        if (runTokenRef.current !== token) {
          return
        }

        setSession((current) => ({
          ...current,
          phase: 'modeling',
          displayBodyOverride: currentItem.ttsText,
          listeningStartedAt: undefined,
          recordingTargetMs: undefined,
          lastTurn: resolvedTurn,
          lastOutcome: outcome,
        }))

        try {
          await speakWithTiming(
            currentItem.ttsText,
            {
              language: 'en-US',
              preferredVoiceName: selectedVoiceName,
            },
            activePromptAudioRef,
          )
        } catch (promptError) {
          if (!(promptError instanceof DOMException && promptError.name === 'AbortError')) {
            // Ignore prompt playback failures and continue the flow.
          }
        }

        await delay(NEXT_ITEM_DELAY_MS)

        if (runTokenRef.current !== token) {
          return
        }

        const nextStep = getNextStep({
          stage,
          currentDeck,
          currentIndex,
          currentItem,
          currentHintLevel: session.hintLevel,
          currentQueueSource: session.currentQueueSource,
          answerReplayQueue: session.answerReplayQueue,
          outcome,
        })

        setSession((current) => ({
          ...current,
          phase: 'prompting',
          currentIndex: nextStep.index,
          currentQueueSource: nextStep.queueSource,
          currentItem: nextStep.item,
          displayBodyOverride: getPromptDisplayBody(
            nextStep.item,
            stage,
            nextStep.hintLevel,
            nextStep.queueSource === 'base' && nextStep.index === currentIndex ? resolvedTurn.transcript : undefined,
          ),
          hintLevel: nextStep.hintLevel,
          answerReplayQueue: nextStep.answerReplayQueue,
          lastPromptDurationMs: 0,
          listeningStartedAt: undefined,
          recordingTargetMs: undefined,
          stopMessage: undefined,
          stopReason: undefined,
        }))
      } catch (captureError) {
        if (captureError instanceof DOMException && captureError.name === 'AbortError') {
          return
        }

        if (runTokenRef.current !== token) {
          return
        }

        setError(captureError instanceof Error ? captureError.message : 'Recording failed')
        stopRun('녹음 중 문제가 발생했습니다. 세션 시작을 다시 눌러 주세요.')
      }
    })()

    return () => {
      abortController.abort()
      activeAbortRef.current = null
    }
  }, [
    currentDeck,
    evaluator,
    isRunning,
    session.currentItem,
    session.currentIndex,
    session.currentQueueSource,
    session.hintLevel,
    session.lastPromptDurationMs,
    session.phase,
    session.answerReplayQueue,
    selectedVoiceName,
    speechRecognitionSupported,
    stage,
    turnController,
  ])

  const recordingTargetMs = session.recordingTargetMs ?? 0
  const rawRecordingElapsedMs =
    session.phase === 'listening' && session.listeningStartedAt
      ? Math.max(0, clockMs - session.listeningStartedAt)
      : 0

  return {
    stage,
    setStage: (nextStage: PracticeStage) => {
      if (isRunning) {
        return
      }

      setStageState(nextStage)
      setError(undefined)
      setSession({
        phase: 'idle',
        currentIndex: 0,
        currentQueueSource: 'base',
        hintLevel: 0,
        answerReplayQueue: [],
        lastPromptDurationMs: 0,
      })
    },
    error,
    session,
    recording: {
      elapsedMs:
        recordingTargetMs > 0 ? Math.min(rawRecordingElapsedMs, recordingTargetMs) : rawRecordingElapsedMs,
      targetMs: recordingTargetMs,
    },
    settings: {
      availableVoices,
      selectedVoiceName,
      setSelectedVoiceName: (voiceName: string) => {
        setSelectedVoiceName(voiceName)
        void previewSelectedVoice(voiceName, voicePreviewTokenRef)
      },
    },
    actions: {
      start: () => {
        void startSession()
      },
    },
    capability: {
      selectorsDisabled: isRunning,
      speechRecognitionSupported,
    },
  }

  function stopRun(message: string) {
    runTokenRef.current += 1
    voicePreviewTokenRef.current += 1
    activeAbortRef.current?.abort()
    activeAbortRef.current = null
    activePromptAudioRef.current?.pause()
    activePromptAudioRef.current = null
    activeRecordedAudioRef.current?.pause()
    activeRecordedAudioRef.current = null
    window.speechSynthesis.cancel()
    setIsRunning(false)
    setSession((current) => ({
      ...current,
      phase: 'stopped',
      displayBodyOverride: undefined,
      stopReason: 'error',
      listeningStartedAt: undefined,
      recordingTargetMs: undefined,
      stopMessage: message,
    }))
  }

  async function startSession() {
    try {
      await ensureMicrophoneAccess()
      await turnController.primeAudioContext()
    } catch (permissionError) {
      const message =
        permissionError instanceof Error
          ? permissionError.message
          : '마이크 권한이 필요합니다. 브라우저에서 허용해 주세요.'

      setError(message)
      setSession({
        phase: 'stopped',
        currentIndex: 0,
        currentQueueSource: 'base',
        displayBodyOverride: undefined,
        hintLevel: 0,
        answerReplayQueue: [],
        lastPromptDurationMs: 0,
        stopReason: 'permission',
        stopMessage: message,
      })
      setIsRunning(false)
      return
    }

    runTokenRef.current += 1
    activeAbortRef.current?.abort()
    activeAbortRef.current = null
    voicePreviewTokenRef.current += 1
    activePromptAudioRef.current?.pause()
    activePromptAudioRef.current = null
    activeRecordedAudioRef.current?.pause()
    activeRecordedAudioRef.current = null
    window.speechSynthesis.cancel()
    setError(undefined)
    setIsRunning(true)
    resetLocalTranscriptionFallback()

    const canResumeCurrentItem =
      session.phase === 'stopped' &&
      session.currentItem &&
      currentDeck[session.currentIndex]?.id === session.currentItem.id

    const resumedIndex = canResumeCurrentItem ? session.currentIndex : 0
    const resumedItem = canResumeCurrentItem ? session.currentItem : currentDeck[0]
    const resumedHintLevel = canResumeCurrentItem ? session.hintLevel : 0
    const resumedQueueSource = canResumeCurrentItem ? session.currentQueueSource : 'base'
    const resumedReplayQueue = canResumeCurrentItem ? session.answerReplayQueue : []

    setSession({
      phase: 'prompting',
      currentIndex: resumedIndex,
      currentQueueSource: resumedQueueSource,
      currentItem: resumedItem,
      displayBodyOverride: getPromptDisplayBody(resumedItem, stage, resumedHintLevel, session.lastTurn?.transcript),
      hintLevel: resumedHintLevel,
      answerReplayQueue: resumedReplayQueue,
      lastPromptDurationMs: 0,
      listeningStartedAt: undefined,
      recordingTargetMs: undefined,
      lastTurn: undefined,
      lastOutcome: undefined,
      stopMessage: undefined,
      stopReason: undefined,
    })
  }
}

interface LocalTranscriptionResponse {
  transcript?: string
  error?: string
}

let localTranscriptionFallbackDisabled = false

interface NextStepInput {
  stage: PracticeStage
  currentDeck: PracticeItem[]
  currentIndex: number
  currentItem: PracticeItem
  currentHintLevel: number
  currentQueueSource: QueueSource
  answerReplayQueue: PracticeItem[]
  outcome: EvaluationOutcome
}

interface NextStepResult {
  index: number
  queueSource: QueueSource
  item: PracticeItem
  hintLevel: number
  answerReplayQueue: PracticeItem[]
}

async function speakWithTiming(
  text: string,
  options: {
    language: string
    preferredVoiceName?: string
  },
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  signal?: AbortSignal,
): Promise<number> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return estimateSpeechDuration(text)
  }

  const normalizedText = normalizeTtsText(text)
  const voiceProfile = resolveVoiceRenderProfile(options.preferredVoiceName)
  const voice = await resolvePreferredEnglishVoice(options.language, voiceProfile.browserVoiceName)

  try {
    return await speakBrowserVoice(normalizedText, options.language, voice, voiceProfile.browserPitch, audioRef)
  } catch {
    // Fall back to local TTS when browser speech is unavailable.
  }

  return playLocalPrompt(normalizedText, voiceProfile.systemVoiceName, audioRef, signal)
}

function estimateSpeechDuration(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1_500, wordCount * 420)
}

async function resolvePreferredEnglishVoice(
  language: string,
  preferredVoiceName?: string,
): Promise<SpeechSynthesisVoice | undefined> {
  const voices = await loadSpeechVoices()
  return pickPreferredEnglishVoice(voices, language, preferredVoiceName)
}

function pickPreferredEnglishVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
  preferredVoiceName?: string,
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) {
    return undefined
  }

  const normalizedLanguage = language.toLowerCase()
  const exactVoices = voices.filter((voice) => voice.lang.toLowerCase() === normalizedLanguage)
  const broadEnglishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const candidates = exactVoices.length > 0 ? exactVoices : broadEnglishVoices

  if (candidates.length === 0) {
    return undefined
  }

  if (preferredVoiceName) {
    const exactVoice = candidates.find((voice) => voice.name === preferredVoiceName)
    if (exactVoice) {
      return exactVoice
    }
  }

  const preferredNames = [
    'samantha',
    'alex',
    'daniel',
    'karen',
    'aria',
    'jenny',
    'guy',
    'google us english',
    'google uk english',
    'zira',
    'david',
  ]

  return [...candidates].sort((left, right) => {
    const leftScore = scoreVoice(left, preferredNames)
    const rightScore = scoreVoice(right, preferredNames)
    return rightScore - leftScore
  })[0]
}

function normalizeTtsText(text: string): string {
  return text
    .replace(/\bETL\b/g, 'E T L')
    .replace(/\bMTS\b/g, 'M T S')
    .replace(/\bSFTP\b/g, 'S F T P')
    .replace(/\bAWS\b/g, 'A W S')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bUI\b/g, 'U I')
    .replace(/\bNPS\b/g, 'N P S')
}

async function playLocalPrompt(
  text: string,
  voiceName: string | undefined,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetch('/api/speak/local', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceName: voiceName || 'Samantha',
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Local TTS request failed')
  }

  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)

  return new Promise<number>((resolve, reject) => {
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    const startedAt = performance.now()

    const cleanup = () => {
      URL.revokeObjectURL(audioUrl)
      if (audioRef.current === audio) {
        audioRef.current = null
      }
    }

    const abortHandler = () => {
      audio.pause()
      cleanup()
      reject(new DOMException('Prompt playback aborted', 'AbortError'))
    }

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    audio.onended = () => {
      cleanup()
      resolve(Math.max(1_000, Math.round(performance.now() - startedAt)))
    }

    audio.onerror = () => {
      cleanup()
      reject(new Error('Local TTS audio playback failed'))
    }

    void audio.play().catch((error) => {
      cleanup()
      reject(error)
    })
  })
}

function scoreVoice(voice: SpeechSynthesisVoice, preferredNames: string[]): number {
  const name = voice.name.toLowerCase()
  let score = 0

  const preferredIndex = preferredNames.findIndex((preferredName) => name.includes(preferredName))
  if (preferredIndex >= 0) {
    score += 100 - preferredIndex
  }

  if (voice.localService) {
    score += 10
  }

  if (voice.lang.toLowerCase().startsWith('en-us')) {
    score += 5
  }

  if (name.includes('whisper')) {
    score -= 50
  }

  return score
}

function selectVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const filteredVoices = englishVoices.filter((voice) => isUsefulEnglishVoice(voice))

  const dedupedVoices = filteredVoices.filter((voice, index, list) => {
    const normalizedName = normalizeVoiceName(voice.name)
    return list.findIndex((candidate) => normalizeVoiceName(candidate.name) === normalizedName) === index
  })

  return dedupedVoices
    .sort((left, right) => scoreVoice(right, PREFERRED_ENGLISH_VOICE_NAMES) - scoreVoice(left, PREFERRED_ENGLISH_VOICE_NAMES))
    .flatMap((voice) => buildVoiceOptionsForVoice(voice))
}

function isUsefulEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  const normalizedName = normalizeVoiceName(voice.name)

  if (EXCLUDED_VOICE_NAME_PARTS.some((part) => normalizedName.includes(part))) {
    return false
  }

  const preferredMatch = PREFERRED_ENGLISH_VOICE_NAMES.some((part) => normalizedName.includes(part))
  if (preferredMatch) {
    return true
  }

  return voice.localService
}

function normalizeVoiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildVoiceOptionsForVoice(voice: SpeechSynthesisVoice): VoiceOption[] {
  const options: VoiceOption[] = [
    {
      name: voice.name,
      label: `${voice.name} (${voice.lang})`,
    },
  ]

  const normalizedName = normalizeVoiceName(voice.name)
  if (HIGH_TONE_FEMALE_VOICE_NAMES.some((candidate) => normalizedName.includes(candidate))) {
    options.push({
      name: `${voice.name}::bright`,
      label: `${voice.name} (${voice.lang}) - 높은 톤`,
    })
  }

  return options
}

function resolveVoiceRenderProfile(selectedVoiceName?: string): VoiceRenderProfile {
  if (!selectedVoiceName) {
    return {
      browserPitch: 1,
    }
  }

  const [browserVoiceName, variant] = selectedVoiceName.split('::')

  if (variant === 'bright') {
    return {
      browserVoiceName,
      systemVoiceName: browserVoiceName,
      browserPitch: 1.22,
    }
  }

  return {
    browserVoiceName,
    systemVoiceName: browserVoiceName,
    browserPitch: 1,
  }
}

async function loadSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  const existingVoices = window.speechSynthesis.getVoices()
  if (existingVoices.length > 0) {
    return existingVoices
  }

  return new Promise((resolve) => {
    const handleVoicesChanged = () => {
      const loadedVoices = window.speechSynthesis.getVoices()
      if (loadedVoices.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
        resolve(loadedVoices)
      }
    }

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)

    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve(window.speechSynthesis.getVoices())
    }, 800)
  })
}

async function ensureMicrophoneAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('이 브라우저는 마이크 입력을 지원하지 않습니다.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function resolveTurnTranscript(turn: SpeechTurnResult, language: string): Promise<SpeechTurnResult> {
  if (extractRecognizedWords(turn.transcript).length > 0 || !turn.audioBase64 || localTranscriptionFallbackDisabled) {
    return turn
  }

  try {
    const transcript = await transcribeWithLocalFallback(turn.audioBase64, language)
    if (!transcript) {
      return turn
    }

    return {
      ...turn,
      transcript,
    }
  } catch {
    localTranscriptionFallbackDisabled = true
    return turn
  }
}

async function transcribeWithLocalFallback(audioBase64: string, language: string): Promise<string> {
  const response = await fetch('/api/transcribe/local', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioBase64,
      language,
    }),
  })

  if (!response.ok) {
    throw new Error('Local transcription request failed')
  }

  const payload = (await response.json()) as LocalTranscriptionResponse
  return payload.transcript?.trim() ?? ''
}

function isLikelySpeechAudio(turn: SpeechTurnResult): boolean {
  if (turn.status !== 'captured') {
    return false
  }

  return turn.metrics.detectedSpeechMs >= 300 || turn.metrics.speechDurationMs >= 700
}

function resetLocalTranscriptionFallback(): void {
  localTranscriptionFallbackDisabled = false
}

async function previewSelectedVoice(
  voiceName: string,
  previewTokenRef: React.MutableRefObject<number>,
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return
  }

  previewTokenRef.current += 1
  const token = previewTokenRef.current

  try {
    window.speechSynthesis.cancel()
    const voiceProfile = resolveVoiceRenderProfile(voiceName)
    const voice = await resolvePreferredEnglishVoice('en-US', voiceProfile.browserVoiceName)

    if (previewTokenRef.current !== token) {
      return
    }

    await speakPreviewSample(VOICE_PREVIEW_TEXT, voice, 'en-US', voiceProfile.browserPitch)
  } catch {
    // Ignore preview failures so voice selection still works.
  }
}

async function speakPreviewSample(
  text: string,
  voice: SpeechSynthesisVoice | undefined,
  language: string,
  pitch = 1,
): Promise<number> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return estimateSpeechDuration(text)
  }

  return new Promise<number>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice?.lang ?? language
    utterance.voice = voice ?? null
    utterance.rate = 1.04
    utterance.pitch = pitch
    utterance.volume = 1
    const startedAt = performance.now()

    utterance.onend = () => {
      resolve(Math.max(1_000, Math.round(performance.now() - startedAt)))
    }

    utterance.onerror = () => {
      resolve(estimateSpeechDuration(text))
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}

async function speakBrowserVoice(
  text: string,
  language: string,
  voice: SpeechSynthesisVoice | undefined,
  pitch: number,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
): Promise<number> {
  audioRef.current?.pause()
  audioRef.current = null
  return speakPreviewSample(text, voice, language, pitch)
}

function getNextStep({
  stage,
  currentDeck,
  currentIndex,
  currentItem,
  currentHintLevel,
  currentQueueSource,
  answerReplayQueue,
  outcome,
}: NextStepInput): NextStepResult {
  if (stage === 'sentence') {
    const shouldRetrySameCard = outcome.status === 'fail_content'
    const nextHintLevel = shouldRetrySameCard ? Math.min(currentHintLevel + 1, 3) : 0
    const nextIndex = shouldRetrySameCard ? currentIndex : (currentIndex + 1) % currentDeck.length
    const nextItem = shouldRetrySameCard ? currentItem : currentDeck[nextIndex] ?? currentItem

    return {
      index: nextIndex,
      queueSource: 'base',
      item: nextItem,
      hintLevel: nextHintLevel,
      answerReplayQueue,
    }
  }

  const shouldReplayLater =
    outcome.status === 'fail_content' || outcome.status === 'pass_content_weak_fluency'
  const nextReplayQueue = shouldReplayLater ? enqueueReplayItem(answerReplayQueue, currentItem) : answerReplayQueue

  if (currentQueueSource === 'base' && currentIndex < currentDeck.length - 1) {
    const nextIndex = currentIndex + 1
    return {
      index: nextIndex,
      queueSource: 'base',
      item: currentDeck[nextIndex] ?? currentItem,
      hintLevel: 0,
      answerReplayQueue: nextReplayQueue,
    }
  }

  if (nextReplayQueue.length > 0 && nextReplayQueue[0]?.id !== currentItem.id) {
    const [nextItem, ...remainingReplayQueue] = nextReplayQueue
    const replayIndex = currentDeck.findIndex((item) => item.id === nextItem?.id)

    return {
      index: replayIndex >= 0 ? replayIndex : 0,
      queueSource: 'replay',
      item: nextItem ?? currentDeck[0] ?? currentItem,
      hintLevel: 0,
      answerReplayQueue: remainingReplayQueue,
    }
  }

  return {
    index: 0,
    queueSource: 'base',
    item: currentDeck[0] ?? currentItem,
    hintLevel: 0,
    answerReplayQueue: nextReplayQueue,
  }
}

function enqueueReplayItem(queue: PracticeItem[], item: PracticeItem): PracticeItem[] {
  if (queue.some((queuedItem) => queuedItem.id === item.id)) {
    return queue
  }

  return [...queue, item]
}

async function playRecordedTurn(
  turn: SpeechTurnResult,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  signal?: AbortSignal,
): Promise<void> {
  if (!turn.audioBase64) {
    return
  }

  const binary = atob(turn.audioBase64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const blob = new Blob([bytes], { type: turn.mimeType ?? 'audio/wav' })
  const audioUrl = URL.createObjectURL(blob)

  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const cleanup = () => {
      URL.revokeObjectURL(audioUrl)
      if (audioRef.current === audio) {
        audioRef.current = null
      }
    }

    const abortHandler = () => {
      audio.pause()
      cleanup()
      reject(new DOMException('Recorded playback aborted', 'AbortError'))
    }

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    audio.onended = () => {
      cleanup()
      resolve()
    }

    audio.onerror = () => {
      cleanup()
      reject(new Error('Recorded playback failed'))
    }

    void audio.play().catch((error) => {
      cleanup()
      reject(error)
    })
  })
}

function getPromptDisplayBody(
  item: PracticeItem | undefined,
  stage: PracticeStage,
  hintLevel: number,
  transcript?: string,
): string | undefined {
  if (!item) {
    return undefined
  }

  if (stage !== 'sentence') {
    return item.displayBody
  }

  if (hintLevel <= 0) {
    return item.displayBody
  }

  const spokenTokens = new Set(tokenizeEnglish(transcript ?? ''))
  const missingKeywords = item.evaluationCard.keywords.filter((keyword) =>
    tokenizeEnglish(keyword).some((token) => !spokenTokens.has(token)),
  )
  const hintKeywords = (missingKeywords.length > 0 ? missingKeywords : item.evaluationCard.keywords).slice(0, 4)

  if (hintLevel === 1) {
    const keywords = hintKeywords.join('  ·  ')
    return keywords ? `${item.displayBody}\n\n힌트: ${keywords}` : item.displayBody
  }

  if (hintLevel === 2) {
    const revealedKeywords = item.evaluationCard.keywords.filter((keyword) => !missingKeywords.includes(keyword))
    return `${item.displayBody}\n\n힌트: ${createCloze(item.evaluationCard.answer, revealedKeywords)}`
  }

  return `${item.displayBody}\n\n${item.evaluationCard.answer}`
}

