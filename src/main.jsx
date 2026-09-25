import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import VoiceInputAccess from './components/VoiceInputAccess'
import ErrorBoundary from './components/ErrorBoundary'
import { watchForStaleBuild } from './lib/staleBuild'
import './index.css'
import './pixel-glass.css'
import './together-type.css'

// Note: intentionally NOT using React.StrictMode in production boot.
// StrictMode double-mounts effects in dev which can cause the Supabase
// auth listener to register twice and race the refresh-token flow.
// A tab open across a deploy asks for chunks that no longer exist.
// Vite tells us when that happens; one reload puts them on the new build.
watchForStaleBuild()

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
    <VoiceInputAccess />
  </ErrorBoundary>,
)
