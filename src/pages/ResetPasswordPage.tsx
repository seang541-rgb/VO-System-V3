import React, { useState } from 'react';
import { KeyRound, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] px-6 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-[2rem] border border-slate-700/50 bg-slate-900/80 p-8 shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur-xl lg:p-10">
        {done ? (
          /* ── Success state ──────────────────────────────────── */
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-2xl font-black text-white">Password updated</h2>
            <p className="text-sm leading-6 text-slate-400">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-500"
            >
              Go to Login
            </button>
          </div>
        ) : (
          /* ── Reset form ─────────────────────────────────────── */
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400">
                <KeyRound size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Account Recovery</div>
                <h2 className="text-2xl font-black text-white">Set new password</h2>
              </div>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  autoFocus
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm Password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              {error && (
                <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-500 ${submitting ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {submitting ? <RefreshCw size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
