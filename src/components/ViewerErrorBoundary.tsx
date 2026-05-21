// Lightweight error boundary for the 3D viewer.
// Catches WebGL / Three.js / web-ifc-three crashes without taking down the full app.
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ViewerErrorBoundary extends (React.Component as new (props: Props) => React.Component<Props, State>) {
  declare state: State;
  declare props: Props;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'The 3D viewer encountered an error.' };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ViewerErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[60vh] min-h-[30rem] items-center justify-center rounded-xl border border-red-500/30 bg-slate-800">
          <div className="text-center px-6">
            <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
            <h3 className="mt-3 text-sm font-bold text-white">3D Viewer Crashed</h3>
            <p className="mt-1 text-xs text-slate-400">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => (this as unknown as React.Component<Props, State>).setState({ hasError: false, errorMessage: '' })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
