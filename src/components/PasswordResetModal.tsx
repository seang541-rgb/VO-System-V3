import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

interface PasswordResetModalProps {
  updatePassword: (password: string) => Promise<void>;
  onDismiss: () => void;
}

export default function PasswordResetModal({ updatePassword, onDismiss }: PasswordResetModalProps) {
  const { t } = useLang();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(t('password.tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }
    setUpdating(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('password.success'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDismiss = () => {
    onDismiss();
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-400">{t('password.label')}</div>
        <h2 className="mt-4 text-2xl font-black text-white">{t('password.title')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('password.hint')}</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('password.newPassword')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
              placeholder={t('password.newPlaceholder')}
              minLength={6}
              required
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('password.confirmPassword')}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
              placeholder={t('password.confirmPlaceholder')}
              minLength={6}
              required
            />
          </label>
          {error && <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={updating}
              className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating ? t('password.updating') : t('password.update')}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
              onClick={handleDismiss}
            >
              {t('password.skip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
