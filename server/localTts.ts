import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

export interface LocalSynthesisResult {
  audioBuffer: Buffer
  contentType: string
}

export async function synthesizeWithSystemVoice(
  text: string,
  voiceName = 'Samantha',
): Promise<LocalSynthesisResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'recall-tts-'))
  const aiffPath = path.join(tempDir, 'prompt.aiff')
  const wavPath = path.join(tempDir, 'prompt.wav')

  try {
    await execFileAsync('say', ['-v', voiceName, '-r', '190', '-o', aiffPath, text])
    await execFileAsync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', aiffPath, wavPath])
    const audioBuffer = await import('node:fs/promises').then((fs) => fs.readFile(wavPath))

    return {
      audioBuffer,
      contentType: 'audio/wav',
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function execFileAsync(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
