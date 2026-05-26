import type { EvaluationStatus } from '../speech/evaluatorTypes'

interface StatusBarProps {
  phase: string
  outcome?: EvaluationStatus
  pauseReason?: 'manual' | 'idle'
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  priming: 'Get ready',
  listening: 'Listening',
  evaluating: 'Evaluating',
  retry: 'Retrying same card',
  paused: 'Paused',
  completed: 'Completed',
}

const OUTCOME_LABELS: Record<EvaluationStatus, string> = {
  pass_content_good_fluency: 'Pass · Good fluency',
  pass_content_weak_fluency: 'Pass · Weak fluency',
  fail_content: 'Retry · Content incomplete',
  no_speech_or_idle: 'Paused · No speech',
}

export function StatusBar({ phase, outcome, pauseReason }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div>
        <span className="status-pill status-pill-primary">{PHASE_LABELS[phase] ?? phase}</span>
        {pauseReason ? (
          <span className="status-pill">{pauseReason === 'idle' ? 'Idle pause' : 'Manual pause'}</span>
        ) : null}
      </div>
      {outcome ? <span className="status-pill">{OUTCOME_LABELS[outcome]}</span> : null}
    </div>
  )
}
