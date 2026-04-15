import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ReciRing] ErrorBoundary caught:', error, info)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        className="w-full min-h-[100dvh] flex items-center justify-center px-6"
        style={{ background: '#EEE9E0' }}
      >
        <div
          style={{
            maxWidth: 420,
            background: '#fff',
            borderRadius: 24,
            padding: '32px 28px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.10)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
            {this.state.error?.message || 'Unexpected error.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                background: '#C8A96A',
                color: '#fff',
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                background: '#fff',
                color: '#111',
                border: '1.5px solid #E5E7EB',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
