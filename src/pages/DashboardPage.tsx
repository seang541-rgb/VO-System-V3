import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, GitCompareArrows, Bot, FileOutput } from 'lucide-react';

interface LayoutContext {
  onNewProject: () => void;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { onNewProject } = useOutletContext<LayoutContext>();

  const cards = [
    {
      icon: BarChart3,
      title: t('welcome.cardAudit'),
      subtitle: t('welcome.cardAuditDesc'),
    },
    {
      icon: GitCompareArrows,
      title: t('welcome.cardCompare'),
      subtitle: t('welcome.cardCompareDesc'),
    },
    {
      icon: Bot,
      title: t('welcome.cardCopilot'),
      subtitle: t('welcome.cardCopilotDesc'),
    },
    {
      icon: FileOutput,
      title: t('welcome.cardExport'),
      subtitle: t('welcome.cardExportDesc'),
    },
  ];

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="max-w-2xl w-full mx-auto text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-[80px] items-center justify-center rounded-xl bg-white/95 px-3 py-2 shadow-sm ring-1 ring-white/20">
            <img
              src="/ideanest-logo.png"
              alt="Idea Nest · VO Copilot"
              className="h-full w-auto object-contain"
            />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">
            {t('app.name')}
          </h1>
          <p className="text-sm text-slate-400">
            {t('welcome.subtitle')}
          </p>
        </div>

        {/* Greeting */}
        <p className="text-base text-slate-300">
          {t('welcome.title')}
        </p>

        {/* Suggestion cards — 2x2 grid */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={onNewProject}
              className="flex flex-col items-start gap-2 rounded-2xl border border-slate-700 bg-slate-800/30 p-5 text-left transition-all duration-200 hover:border-slate-600 hover:bg-slate-800/50"
            >
              <card.icon size={20} className="text-blue-400" />
              <span className="text-sm font-medium text-white">
                {card.title}
              </span>
              <span className="text-[11px] text-slate-500">
                {card.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
