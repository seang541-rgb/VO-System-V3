import { useLang } from '../i18n/LanguageContext';

const GUIDE_CARDS = [
  { icon: '📁', titleKey: 'guide.uploadTitle', stepsKey: 'guide.uploadSteps', tipKey: 'guide.uploadTip' },
  { icon: '📊', titleKey: 'guide.auditTitle', stepsKey: 'guide.auditSteps', tipKey: 'guide.auditTip' },
  { icon: '🔀', titleKey: 'guide.voTitle', stepsKey: 'guide.voSteps', tipKey: 'guide.voTip' },
  { icon: '📋', titleKey: 'guide.excelTitle', stepsKey: 'guide.excelSteps', tipKey: 'guide.excelTip' },
  { icon: '🤖', titleKey: 'guide.copilotTitle', stepsKey: 'guide.copilotSteps', tipKey: 'guide.copilotTip' },
  { icon: '🧊', titleKey: 'guide.viewerTitle', stepsKey: 'guide.viewerSteps', tipKey: 'guide.viewerTip' },
  { icon: '🔗', titleKey: 'guide.bqTitle', stepsKey: 'guide.bqSteps', tipKey: 'guide.bqTip' },
  { icon: '📄', titleKey: 'guide.templateTitle', stepsKey: 'guide.templateSteps', tipKey: 'guide.templateTip' },
  { icon: '🌐', titleKey: 'guide.langTitle', stepsKey: 'guide.langSteps', tipKey: 'guide.langTip' },
] as const;

export default function GuidePage() {
  const { t } = useLang();

  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900 px-4 py-6 lg:px-6">
      <div className="mb-6">
        <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">{t('guide.heading')}</div>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">{t('guide.subheading')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {GUIDE_CARDS.map((card) => (
          <div
            key={card.titleKey}
            className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 transition hover:border-slate-600 hover:bg-slate-800/80"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{card.icon}</span>
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">{t(card.titleKey)}</h3>
            </div>

            <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-300">
              {t(card.stepsKey).split('\n').map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-300">{i + 1}</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-blue-900/50 bg-blue-950/30 px-3 py-2 text-xs text-blue-300">
              💡 {t(card.tipKey)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
