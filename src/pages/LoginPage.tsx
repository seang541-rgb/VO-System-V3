import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const { t } = useTranslation();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
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
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage(t('login.resetSent'));
      } else if (mode === 'login') {
        await signIn(email, password);
      } else {
        const signUpMessage = await signUp(email, password);
        if (signUpMessage) {
          setMessage(signUpMessage);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.authFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] px-6 py-10 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6 rounded-[2rem] border border-slate-700/50 bg-slate-900/70 p-8 shadow-[0_20px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:p-10">
          <div className="inline-flex items-center gap-3 rounded-full border border-blue-600/20 bg-blue-600/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
            <ShieldCheck size={14} /> {t('login.tagline')}
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-black leading-tight text-white lg:text-5xl">
              {t('login.taglineDesc')}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-400 lg:text-lg">
              {t('login.localNote')}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t('login.featureCommercial')}</div>
              <div className="mt-3 text-xl font-bold text-white">{t('login.featureCommercialTitle')}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{t('login.featureCommercialDesc')}</div>
            </div>
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t('login.featureMeter')}</div>
              <div className="mt-3 text-xl font-bold text-white">{t('login.featureMeterTitle')}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{t('login.featureMeterDesc')}</div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-700/50 bg-slate-900/80 p-8 shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur-xl lg:p-10">
          {mode === 'forgot' ? (
            /* ── Forgot Password view ──────────────────────────── */
            <div>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
              >
                <ArrowLeft size={14} /> {t('login.backToLogin')}
              </button>
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{t('login.accountRecovery')}</div>
              <h2 className="mt-2 text-3xl font-black text-white">{t('login.resetPassword')}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {t('login.resetDesc')}
              </p>
            </div>
          ) : (
            /* ── Login / Signup header ─────────────────────────── */
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{t('login.secureAccess')}</div>
                <h2 className="mt-2 text-3xl font-black text-white">{mode === 'login' ? t('login.signIn') : t('login.createAccount')}</h2>
              </div>
              <div className="inline-flex rounded-2xl border border-slate-700/50 bg-slate-800 p-1 text-sm">
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2 font-semibold transition ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                >
                  {t('login.loginTab')}
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2 font-semibold transition ${mode === 'signup' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                >
                  {t('login.signupTab')}
                </button>
              </div>
            </div>
          )}

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('login.email')}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                required
              />
            </label>

            {mode !== 'forgot' && (
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('login.password')}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                  placeholder={t('login.passwordHint')}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </label>
            )}

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                  className="text-xs text-blue-400 transition hover:text-blue-300 hover:underline"
                >
                  {t('login.forgotPassword')}
                </button>
              </div>
            )}

            {error && <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}
            {message && <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{message}</div>}

            <button
              type="submit"
              disabled={submitting}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3 text-sm font-black tracking-[0.16em] uppercase transition ${
                mode === 'forgot'
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : mode === 'login'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-emerald-500 hover:bg-emerald-400'
              } ${submitting ? 'cursor-not-allowed opacity-60' : 'text-white'}`}
            >
              {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {submitting
                ? t('common.processing')
                : mode === 'forgot'
                  ? t('login.sendResetLink')
                  : mode === 'login'
                    ? t('login.enterWorkspace')
                    : t('login.createWorkspaceAccount')}
            </button>

            <Link
              to="/local"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700/70 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft size={16} />
              {t('login.openLocalWorkspace')}
            </Link>
          </form>
        </section>
      </div>
    </div>
  );
}
