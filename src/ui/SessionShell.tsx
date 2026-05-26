import { useState } from 'react'
import type { PracticeStage } from '../app/practiceDeck'
import type { EvaluationOutcome, SpeechTurnResult } from '../speech/evaluatorTypes'
import { CardView } from './CardView'

type StopReason = 'idle' | 'noise' | 'permission' | 'error'

interface SessionShellProps {
  stage: PracticeStage
  onStageChange: (stage: PracticeStage) => void
  session: {
    phase: string
    currentItem?: {
      displayBody: string
    }
    displayBodyOverride?: string
    lastTurn?: SpeechTurnResult
    lastOutcome?: EvaluationOutcome
    stopMessage?: string
    stopReason?: StopReason
  }
  error?: string
  recording: {
    elapsedMs: number
    targetMs: number
  }
  settings: {
    availableVoices: Array<{
      name: string
      label: string
    }>
    selectedVoiceName?: string
    setSelectedVoiceName: (voiceName: string) => void
  }
  capability: {
    selectorsDisabled: boolean
  }
  actions: {
    start: () => void
  }
}

export function SessionShell({
  stage,
  onStageChange,
  session,
  error,
  recording,
  settings,
  capability,
  actions,
}: SessionShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <main className="session-shell">
      <section className="topbar">
        <div className="settings-wrap">
          <button
            type="button"
            className="settings-toggle"
            onClick={() => setSettingsOpen((current) => !current)}
            disabled={capability.selectorsDisabled}
            aria-label="설정 열기"
            aria-expanded={settingsOpen}
          >
            ...
          </button>

          {settingsOpen ? (
            <div className="settings-panel">
              <div className="mode-switch" role="radiogroup" aria-label="Practice stage">
                <button
                  type="button"
                  className={stage === 'sentence' ? 'mode-button active' : 'mode-button'}
                  onClick={() => onStageChange('sentence')}
                  disabled={capability.selectorsDisabled}
                >
                  문장
                </button>
                <button
                  type="button"
                  className={stage === 'answer' ? 'mode-button active' : 'mode-button'}
                  onClick={() => onStageChange('answer')}
                  disabled={capability.selectorsDisabled}
                >
                  답변
                </button>
              </div>

              {settings.availableVoices.length > 0 ? (
                <label className="voice-picker">
                  <span className="eyebrow">Voice</span>
                  <select
                    value={settings.selectedVoiceName ?? ''}
                    onChange={(event) => settings.setSelectedVoiceName(event.target.value)}
                    disabled={capability.selectorsDisabled}
                  >
                    {settings.availableVoices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="topbar-spacer" />

        <button
          type="button"
          className="primary-button start-button"
          onClick={actions.start}
          disabled={session.phase !== 'idle' && session.phase !== 'stopped'}
        >
          {getStartButtonLabel(session.phase, session.stopReason)}
        </button>
      </section>

      <section className="practice-shell">
        <CardView
          body={session.displayBodyOverride ?? session.currentItem?.displayBody}
          phase={session.phase}
          recording={recording}
          turn={session.lastTurn}
        />

        {session.stopMessage ? (
          <div className="floating-banner">{session.stopMessage}</div>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  )
}

function getStartButtonLabel(phase: string, stopReason?: StopReason): string {
  if (phase === 'listening') {
    return '녹음 중'
  }

  if (phase === 'result') {
    return '음성 인식 확인'
  }

  if (phase === 'modeling') {
    return '모범 음성 재생 중'
  }

  if (phase === 'prompting') {
    return '녹음 준비 중'
  }

  if (phase !== 'stopped') {
    return '시작'
  }

  if (stopReason === 'idle') {
    return '같은 문장 이어서'
  }

  if (stopReason === 'noise') {
    return '같은 문장 다시'
  }

  if (stopReason === 'permission') {
    return '권한 확인 후 시작'
  }

  return '다시 시작'
}
