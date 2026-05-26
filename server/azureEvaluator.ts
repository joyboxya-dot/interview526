import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

export interface AzureAssessmentResult {
  transcript: string
  accuracyScore: number
  fluencyScore: number
  completenessScore: number
  prosodyScore?: number
}

export interface AzureSynthesisResult {
  audioBuffer: Buffer
  contentType: string
}

export async function evaluateWithAzure(
  audioBase64: string,
  referenceText: string,
  language = 'en-US',
): Promise<AzureAssessmentResult> {
  const subscriptionKey = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION

  if (!subscriptionKey || !region) {
    throw new Error('Azure Speech credentials are missing')
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region)
  speechConfig.speechRecognitionLanguage = language

  const pushStream = sdk.AudioInputStream.createPushStream()
  pushStream.write(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength))
  pushStream.close()

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream)
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
  const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true,
  )
  ;(pronunciationConfig as unknown as {
    enableProsodyAssessment?: () => void
  }).enableProsodyAssessment?.()
  pronunciationConfig.applyTo(recognizer)

  return new Promise<AzureAssessmentResult>((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        try {
          const rawJson =
            result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ?? '{}'
          const parsed = JSON.parse(rawJson) as {
            DisplayText?: string
            NBest?: Array<{
              PronunciationAssessment?: {
                AccuracyScore?: number
                FluencyScore?: number
                CompletenessScore?: number
                ProsodyScore?: number
              }
            }>
          }

          const assessment = parsed.NBest?.[0]?.PronunciationAssessment

          resolve({
            transcript: parsed.DisplayText ?? result.text ?? '',
            accuracyScore: assessment?.AccuracyScore ?? 0,
            fluencyScore: assessment?.FluencyScore ?? 0,
            completenessScore: assessment?.CompletenessScore ?? 0,
            prosodyScore: assessment?.ProsodyScore,
          })
        } catch (error) {
          reject(error)
        } finally {
          recognizer.close()
        }
      },
      (error) => {
        recognizer.close()
        reject(error)
      },
    )
  })
}

export async function synthesizeWithAzure(
  text: string,
  voiceName = 'en-US-JennyNeural',
): Promise<AzureSynthesisResult> {
  const subscriptionKey = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION

  if (!subscriptionKey || !region) {
    throw new Error('Azure Speech credentials are missing')
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region)
  speechConfig.speechSynthesisVoiceName = voiceName
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig)

  return new Promise<AzureSynthesisResult>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        try {
          if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
            reject(new Error('Azure synthesis did not complete successfully'))
            return
          }

          resolve({
            audioBuffer: Buffer.from(result.audioData),
            contentType: 'audio/wav',
          })
        } finally {
          synthesizer.close()
        }
      },
      (error) => {
        synthesizer.close()
        reject(error)
      },
    )
  })
}
