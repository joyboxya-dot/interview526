import type { SpeechTurnResult } from '../speech/evaluatorTypes'
import { extractRecognizedWords } from '../lib/transcript'

interface CardViewProps {
  body?: string
  phase: string
  recording?: {
    elapsedMs: number
    targetMs: number
  }
  turn?: SpeechTurnResult
}

export function CardView({ body, phase, recording, turn }: CardViewProps) {
  if (!body) {
    return (
      <section className="card-panel empty-panel">
        <div className="idle-dot" />
      </section>
    )
  }

  const recognizedWords = extractRecognizedWords(turn?.transcript)
  const transcriptUnavailable =
    phase === 'result' && turn?.status === 'captured' && recognizedWords.length === 0

  return (
    <section className="card-panel">
      <div className="question-block">
        <p className="question">{body}</p>
      </div>

      {phase === 'listening' && recording ? (
        <>
          <div className="recording-progress-panel">
            <div className="recording-bar">
              <div
                className="recording-bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(6, (recording.elapsedMs / Math.max(1, recording.targetMs)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="recording-panel">
            <div className="recording-head">
              <span className="recording-dot" />
              <span className="recording-label">REC</span>
              <span className="recording-time">
                {formatClock(recording.elapsedMs)} / {formatClock(recording.targetMs)}
              </span>
            </div>
          </div>
        </>
      ) : null}

      {phase === 'result' ? (
        <div className="status-box compact">
          <p className="result-label">음성 인식</p>
          <p className="result-metrics">
            {transcriptUnavailable ? '말은 감지됐지만 스크립트가 비어 있습니다.' : recognizedWords.join(' ') || '없음'}
          </p>
        </div>
      ) : null}

      {turn?.transcript ? (
        <div className="transcript-box">
          <p className="transcript-text">{turn.transcript}</p>
        </div>
      ) : null}
    </section>
  )
}

function formatClock(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
