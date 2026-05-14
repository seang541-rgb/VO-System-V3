import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import LoginPage from '../pages/LoginPage';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="rounded-2xl border border-white/8 bg-zinc-900/80 px-6 py-5 text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
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
