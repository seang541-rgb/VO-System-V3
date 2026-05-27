// Error Boundary — class component required by React API.
// React 19 types have issues with class components, hence the type assertions.
import React from 'react';
import i18n from '../lib/i18n';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface EBProps {
  children: React.ReactNode;
}

interface EBState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends (React.Component as new (props: EBProps) => React.Component<EBProps, EBState>) {
  declare state: EBState;
  declare props: EBProps;

  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, errorMessage: error?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-800 p-8 text-center shadow-xl">
            <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
            <h2 className="mt-4 text-lg font-bold text-white">{i18n.t('errorBoundary.title')}</h2>
            <p className="mt-2 text-sm text-slate-400">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-blue-500"
            >
              <RefreshCw className="h-4 w-4" /> {i18n.t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
