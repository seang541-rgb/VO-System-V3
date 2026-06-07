import { useLang } from '../i18n/LanguageContext';

interface BulkMappingToastProps {
  instanceCount: number;
  labelCount: number;
  itemReference: string;
  onApply: () => void;
  onSkip: () => void;
}

export default function BulkMappingToast({ instanceCount, labelCount, itemReference, onApply, onSkip }: BulkMappingToastProps) {
  const { t } = useLang();
  return (
    <div className="text-sm">
      <p className="font-semibold text-slate-100">{t('bulk.title')}</p>
      <p className="mt-1 text-slate-300">
        {t('bulk.message', { instanceCount: String(instanceCount), labelCount: String(labelCount), reference: itemReference })}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
          onClick={onApply}
        >
          {t('bulk.applyAll')}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          onClick={onSkip}
        >
          {t('bulk.skip')}
        </button>
      </div>
    </div>
  );
}
