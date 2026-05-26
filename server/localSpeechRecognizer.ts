import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

interface LocalTranscriptionResult {
  transcript: string
  error?: string
}

export async function transcribeWithSystemSpeech(
  audioBase64: string,
  language = 'en-US',
): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'recall-stt-'))
  const wavPath = path.join(tempDir, 'input.wav')

  try {
    await writeFile(wavPath, Buffer.from(audioBase64, 'base64'))
    const stdout = await execFileStdout('swift', [
      path.join(process.cwd(), 'server', 'speechTranscriber.swift'),
      wavPath,
      language,
    ])
    const parsed = JSON.parse(stdout) as LocalTranscriptionResult

    if (parsed.error) {
      throw new Error(parsed.error)
    }

    return parsed.transcript
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function execFileStdout(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }

      resolve(stdout.trim())
    })
  })
}
