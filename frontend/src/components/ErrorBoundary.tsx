import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Warning, ArrowClockwise, HouseLine, Copy, Check } from '@phosphor-icons/react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    copied: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleCopyError = () => {
    if (this.state.error) {
      navigator.clipboard.writeText(
        `${this.state.error.name}: ${this.state.error.message}\n\nStack:\n${this.state.error.stack || 'No stack trace available'}`
      );
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div 
          style={{
            minHeight: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#070709',
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            color: '#ededed',
            padding: '24px',
            boxSizing: 'border-box',
            fontFamily: 'var(--font-sans, "Public Sans", -apple-system, sans-serif)',
          }}
        >
          <div 
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: 'rgba(13, 14, 18, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '36px 32px',
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Ambient Icon Badge */}
            <div 
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171',
                marginBottom: '20px',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
              }}
            >
              <Warning size={28} weight="duotone" />
            </div>

            <h2 
              style={{
                fontSize: '1.4rem',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              }}
            >
              Workspace Interrupted
            </h2>

            <p 
              style={{
                fontSize: '0.88rem',
                color: 'rgba(255, 255, 255, 0.6)',
                lineHeight: 1.6,
                marginBottom: '28px',
              }}
            >
              An unexpected condition occurred while rendering this view. You can reload the page or navigate back to the dashboard safety.
            </p>

            {/* Action Buttons */}
            <div 
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: '24px',
              }}
            >
              <button
                onClick={() => window.location.reload()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  background: '#ffffff',
                  color: '#070709',
                  border: '1px solid #ffffff',
                  borderRadius: '9999px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 4px 14px rgba(255, 255, 255, 0.2)',
                }}
              >
                <ArrowClockwise size={15} weight="bold" />
                <span>Reload Page</span>
              </button>

              <button
                onClick={() => {
                  window.location.href = '/dashboard';
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#ededed',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '9999px',
                  fontSize: '0.84rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <HouseLine size={15} />
                <span>Back to Dashboard</span>
              </button>
            </div>

            {/* Diagnostic Details Accordion */}
            {this.state.error && (
              <div style={{ marginTop: '20px', textAlign: 'left' }}>
                <button
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                    margin: '0 auto',
                    display: 'block',
                  }}
                >
                  {this.state.showDetails ? 'Hide Diagnostics' : 'Show Diagnostics'}
                </button>

                {this.state.showDetails && (
                  <div 
                    style={{
                      marginTop: '12px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '12px',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#f87171', fontFamily: 'monospace', fontWeight: 600 }}>
                        {this.state.error.name}
                      </span>
                      <button
                        onClick={this.handleCopyError}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.68rem',
                        }}
                      >
                        {this.state.copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                        <span>{this.state.copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre 
                      style={{
                        margin: 0,
                        fontSize: '0.72rem',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontFamily: 'var(--font-mono, monospace)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '120px',
                        overflowY: 'auto',
                      }}
                    >
                      {this.state.error.message}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
