import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg-primary, #0f172a)',
          color: 'var(--text-primary, #f8fafc)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '420px',
            width: '100%',
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border, #334155)',
            borderRadius: '20px',
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>
              Bir şeyler ters gitti
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '24px', lineHeight: '1.5' }}>
              Sayfa yüklenirken beklenmedik bir hata oluştu. Sayfayı yenileyerek tekrar deneyebilirsiniz.
            </p>

            {this.state.error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '20px',
                textAlign: 'left',
                fontSize: '12px',
                color: '#f87171',
                maxHeight: '120px',
                overflowY: 'auto',
                wordBreak: 'break-word'
              }}>
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReset}
              style={{
                width: '100%',
                padding: '13px',
                background: '#6366f1',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
              }}
             role="button" tabIndex={0} aria-label="buton">
              Tekrar Dene
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
