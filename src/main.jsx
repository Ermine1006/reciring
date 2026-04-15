import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Note: intentionally NOT using React.StrictMode in production boot.
// StrictMode double-mounts effects in dev which can cause the Supabase
// auth listener to register twice and race the refresh-token flow.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
