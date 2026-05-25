import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import LoginPage from '../pages/LoginPage';

export default function AuthGuard({ children, allowLocal = false }: { children: React.ReactNode; allowLocal?: boolean }) {
  const { session, loading } = useAuth();

  if (allowLocal) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-300">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 px-6 py-5 text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
          Initializing secure session...
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
