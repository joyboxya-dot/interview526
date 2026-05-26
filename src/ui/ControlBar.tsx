interface ControlBarProps {
  canPause: boolean
  canResume: boolean
  canPlayModelAudio: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  onRevealHint: () => void
  onSpeakModel: () => void
}

export function ControlBar({
  canPause,
  canResume,
  canPlayModelAudio,
  onStart,
  onPause,
  onResume,
  onEnd,
  onRevealHint,
  onSpeakModel,
}: ControlBarProps) {
  return (
    <div className="control-bar">
      <button type="button" className="primary-button" onClick={onStart}>
        세션 시작
      </button>
      <button type="button" onClick={onResume} disabled={!canResume}>
        계속 / 재개
      </button>
      <button type="button" onClick={onPause} disabled={!canPause}>
        일시정지
      </button>
      <button type="button" onClick={onRevealHint}>
        힌트 더 보기
      </button>
      <button type="button" onClick={onSpeakModel} disabled={!canPlayModelAudio}>
        모범 듣기
      </button>
      <button type="button" onClick={onEnd}>
        종료
      </button>
    </div>
  )
}
