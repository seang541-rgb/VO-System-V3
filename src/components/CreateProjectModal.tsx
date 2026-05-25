import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<unknown>;
}

export default function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), description.trim() || undefined);
      setName('');
      setDescription('');
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">{t('project.createTitle')}</h2>
          <button
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={handleClose}
            disabled={creating}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {t('project.name')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/40 transition-colors"
              placeholder={t('project.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              disabled={creating}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {t('project.description')}
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/40 transition-colors resize-none"
              placeholder={t('project.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              disabled={creating}
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              onClick={handleClose}
              disabled={creating}
            >
              {t('project.cancel')}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
              disabled={creating || !name.trim()}
            >
              {creating && <Loader2 size={13} className="animate-spin" />}
              {t('project.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
