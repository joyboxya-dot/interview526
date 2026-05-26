import Foundation
import Speech

struct TranscriptionResult: Codable {
    let transcript: String
    let error: String?
}

func printAndExit(_ result: TranscriptionResult, code: Int32) -> Never {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]

    if let data = try? encoder.encode(result),
       let output = String(data: data, encoding: .utf8) {
        print(output)
    } else {
        print("{\"transcript\":\"\",\"error\":\"encoding_failed\"}")
    }

    exit(code)
}

guard CommandLine.arguments.count >= 2 else {
    printAndExit(TranscriptionResult(transcript: "", error: "missing_audio_path"), code: 1)
}

let audioPath = CommandLine.arguments[1]
let localeIdentifier = CommandLine.arguments.count >= 3 ? CommandLine.arguments[2] : "en-US"
let audioURL = URL(fileURLWithPath: audioPath)

guard FileManager.default.fileExists(atPath: audioURL.path) else {
    printAndExit(TranscriptionResult(transcript: "", error: "audio_file_not_found"), code: 1)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
    printAndExit(TranscriptionResult(transcript: "", error: "speech_recognizer_unavailable"), code: 1)
}

let authSemaphore = DispatchSemaphore(value: 0)
var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined

SFSpeechRecognizer.requestAuthorization { status in
    authStatus = status
    authSemaphore.signal()
}

_ = authSemaphore.wait(timeout: .now() + 10)

guard authStatus == .authorized else {
    printAndExit(TranscriptionResult(transcript: "", error: "speech_authorization_denied"), code: 1)
}

let request = SFSpeechURLRecognitionRequest(url: audioURL)
request.shouldReportPartialResults = false

if #available(macOS 13.0, *) {
    request.addsPunctuation = false
}

let recognitionSemaphore = DispatchSemaphore(value: 0)
var finalTranscript = ""
var recognitionError: String?

let task = recognizer.recognitionTask(with: request) { result, error in
    if let result {
        finalTranscript = result.bestTranscription.formattedString

        if result.isFinal {
            recognitionSemaphore.signal()
        }
    } else if let error {
        recognitionError = error.localizedDescription
        recognitionSemaphore.signal()
    }
}

let waitResult = recognitionSemaphore.wait(timeout: .now() + 30)
task.cancel()

if waitResult == .timedOut {
    printAndExit(TranscriptionResult(transcript: finalTranscript, error: "speech_timeout"), code: 1)
}

if let recognitionError {
    printAndExit(TranscriptionResult(transcript: finalTranscript, error: recognitionError), code: 1)
}

printAndExit(TranscriptionResult(transcript: finalTranscript, error: nil), code: 0)
