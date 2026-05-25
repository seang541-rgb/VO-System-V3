import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { router } from './router';
import { isSupabaseConfigured } from './lib/supabase';
import './lib/i18n';
import './index.css';

function ConfigurationRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6 text-slate-100">
      <section className="w-full max-w-lg border border-slate-700 bg-slate-800 p-6">
        <div className="text-xs font-semibold uppercase text-blue-400">VO System</div>
        <h1 className="mt-3 text-lg font-semibold">Supabase configuration required</h1>
        <p className="mt-2 text-sm text-slate-300">
          Local startup is ready, but authentication and project data require a Supabase publishable key.
        </p>
        <div className="mt-5 space-y-2 bg-slate-950 p-3 font-mono text-xs text-slate-300">
          <div>VITE_SUPABASE_URL=...</div>
          <div>VITE_SUPABASE_PUBLISHABLE_KEY=...</div>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Add these values to <code>.env.local</code>, then restart the development server.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? (
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      ) : (
        <ConfigurationRequired />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
