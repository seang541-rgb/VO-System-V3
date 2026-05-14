import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        const signUpMessage = await signUp(email, password);
        if (signUpMessage) {
          setMessage(signUpMessage);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#09090b_52%,_#020617_100%)] px-6 py-10 text-zinc-100">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6 rounded-[2rem] border border-white/8 bg-zinc-950/70 p-8 shadow-[0_20px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:p-10">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
            <ShieldCheck size={14} /> Zero Data Upload BIM Audit
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-black leading-tight text-white lg:text-5xl">
              Cloud-metered VO commercial auditing, local IFC parsing, no model upload.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-400 lg:text-lg">
              Your IFC stays inside the browser. Only authentication and credit enforcement go to Supabase.
              This keeps the BIM workflow local while making the premium audit meter tamper-resistant.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-zinc-900/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Commercial Output</div>
              <div className="mt-3 text-xl font-bold text-white">Star Rate Build-up + VO Excel</div>
              <div className="mt-2 text-sm leading-6 text-zinc-400">Generate defensible omission/addition reports without moving the IFC off the machine.</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-zinc-900/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Credit Meter</div>
              <div className="mt-3 text-xl font-bold text-white">5 free premium audits</div>
              <div className="mt-2 text-sm leading-6 text-zinc-400">Every premium Excel export is checked against the cloud balance before the local download runs.</div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/8 bg-zinc-950/80 p-8 shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur-xl lg:p-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">Secure Access</div>
              <h2 className="mt-2 text-3xl font-black text-white">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
            </div>
            <div className="inline-flex rounded-2xl border border-white/8 bg-zinc-900 p-1 text-sm">
              <button
                type="button"
                className={`rounded-xl px-4 py-2 font-semibold transition ${mode === 'login' ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={`rounded-xl px-4 py-2 font-semibold transition ${mode === 'signup' ? 'bg-emerald-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                onClick={() => setMode('signup')}
              >
                Sign up
              </button>
            </div>
          </div>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-white/8 bg-zinc-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/8 bg-zinc-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
                placeholder="Minimum 6 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
            </label>

            {error && <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}
            {message && <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{message}</div>}

            <button
              type="submit"
              disabled={submitting}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3 text-sm font-black tracking-[0.16em] uppercase transition ${mode === 'login' ? 'bg-sky-500 hover:bg-sky-400' : 'bg-emerald-500 hover:bg-emerald-400'} ${submitting ? 'cursor-not-allowed opacity-60' : 'text-white'}`}
            >
              {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {submitting ? 'Processing' : mode === 'login' ? 'Enter Workspace' : 'Create Workspace Account'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
