import './App.css'
import { useRecallTrainer } from './app/useRecallTrainer'
import { SessionShell } from './ui/SessionShell'

function App() {
  const trainer = useRecallTrainer()

  return (
    <SessionShell
      stage={trainer.stage}
      onStageChange={trainer.setStage}
      session={trainer.session}
      error={trainer.error}
      recording={trainer.recording}
      settings={trainer.settings}
      capability={trainer.capability}
      actions={trainer.actions}
    />
  )
}

export default App
