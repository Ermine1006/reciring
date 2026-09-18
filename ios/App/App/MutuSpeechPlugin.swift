import Foundation
import AVFoundation
import Capacitor
import Speech

// Voice typing for the iOS app. Speech becomes an editable draft in the
// web layer; nothing is sent or stored here. Recognition stays on the
// device whenever the language model is available locally.
//
// JS: registerPlugin('MutuSpeech') → available(), start({ language }),
// stop(); events "result" { text, isFinal } and "end".
@objc(MutuSpeechPlugin)
public class MutuSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MutuSpeechPlugin"
    public let jsName = "MutuSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": SFSpeechRecognizer(locale: Locale(identifier: "en-US")) != nil])
    }

    @objc func start(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "en-US"
        askPermissions { granted in
            DispatchQueue.main.async {
                guard granted else {
                    call.reject("Microphone or speech recognition is not allowed.", "not-allowed")
                    return
                }
                self.begin(language: language, call: call)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Stop listening; the task then delivers its final result and "end".
            self.stopAudio()
            if self.task == nil { self.finish() }
            call.resolve()
        }
    }

    private func askPermissions(_ done: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { done(false); return }
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { done($0) }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { done($0) }
            }
        }
    }

    private func begin(language: String, call: CAPPluginCall) {
        task?.cancel()
        stopAudio()
        task = nil
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.isAvailable else {
            call.reject("Speech recognition is unavailable right now.", "unavailable")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = audioEngine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if let result = result {
                        self.notifyListeners("result", data: [
                            "text": result.bestTranscription.formattedString,
                            "isFinal": result.isFinal,
                        ])
                    }
                    if error != nil || result?.isFinal == true {
                        self.stopAudio()
                        self.task = nil
                        self.finish()
                    }
                }
            }
            call.resolve()
        } catch {
            stopAudio()
            finish()
            call.reject("Voice input could not start.", "start-failed")
        }
    }

    private func stopAudio() {
        if audioEngine.isRunning { audioEngine.stop() }
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        request = nil
    }

    private func finish() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        notifyListeners("end", data: [:])
    }
}
