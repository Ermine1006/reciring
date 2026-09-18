import Capacitor

// Registers Mutu's in-app plugins (they live in this target, not in a
// package, so Capacitor cannot discover them on its own).
class MutuBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MutuSpeechPlugin())
    }
}
