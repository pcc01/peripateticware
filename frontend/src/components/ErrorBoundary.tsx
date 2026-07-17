// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Top-level React ErrorBoundary — defense-in-depth against blank pages.
 *
 * Without this, ANY uncaught render exception anywhere in the tree unmounts
 * the whole SPA down to the empty `<div id="root">`, which is what users
 * perceive as "the app went blank". This component catches render errors
 * and shows a real fallback UI with a reload/retry action instead.
 *
 * This does NOT replace fixing the underlying bugs that throw (e.g. raw
 * error objects rendered as React children) — it's a last-resort safety net
 * so future uncaught errors degrade gracefully instead of blanking the app.
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            background: '#faf7f2',
            color: '#1f2937',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', maxWidth: 480 }}>
            An unexpected error occurred and this page couldn't be displayed.
            You can try again, or reload the app.
          </p>
          {this.state.error?.message && (
            <pre
              style={{
                background: '#f1f5f9',
                color: '#475569',
                padding: '0.75rem 1rem',
                borderRadius: '0.4rem',
                fontSize: '0.75rem',
                maxWidth: 560,
                overflowX: 'auto',
                marginBottom: '1.5rem',
                textAlign: 'left',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '0.4rem',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#1f2937',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '0.4rem',
                border: 'none',
                background: '#4a7c59',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
