import { Coins, HelpCircle, LogOut } from 'lucide-react';
import { useLang } from '../i18n/LanguageContext';
import type { ActiveTab } from '../lib/format';

interface AppHeaderProps {
  creditsBalance: number | null;
  creditsLoading: boolean;
  onSignOut: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_TABS: { key: ActiveTab; i18nKey: string }[] = [
  { key: 'copilot', i18nKey: 'header.tab.copilot' },
  { key: 'overview', i18nKey: 'header.tab.overview' },
  { key: 'audit', i18nKey: 'header.tab.audit' },
  { key: 'valuation', i18nKey: 'header.tab.valuation' },
  { key: 'dwg', i18nKey: 'header.tab.dwg' },
  // RVT tab hidden until APS credentials are available
  // { key: 'rvt', i18nKey: 'header.tab.rvt' },
];

export default function AppHeader({
  creditsBalance,
  creditsLoading,
  onSignOut,
  activeTab,
  onTabChange,
}: AppHeaderProps) {
  const { t, lang, setLang } = useLang();
  return (
    <header className="sticky top-0 z-40 h-12 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="flex h-full items-center justify-between px-4">
        {/* Left: Logo + Name */}
        <div className="flex items-center gap-2.5">
          <img
            src="/ideanest-logo.png"
            alt="IdeaNest"
            className="h-9 w-auto object-contain"
          />
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <span className="text-sm font-bold tracking-wide text-slate-100">IdeaNest</span>
            <span className="text-[10px] text-slate-500">·</span>
            <span className="text-[10px] font-medium tracking-wide text-slate-400">BIM Audit Copilot</span>
          </div>
        </div>

        {/* Center: Navigation tabs */}
        <nav className="flex items-center gap-1">
          {NAV_TABS.map(({ key, i18nKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === key
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(i18nKey)}
            </button>
          ))}
        </nav>

        {/* Right: Guide + Credits + Language + Sign Out */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onTabChange('guide')}
            className={`rounded-lg p-1.5 transition ${
              activeTab === 'guide'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
            }`}
            title={t('sidebar.guide')}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1">
            <Coins className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">{t('header.credits')}</span>
            <span className="text-xs font-bold text-white">{creditsLoading ? '...' : creditsBalance ?? '-'}</span>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 hover:border-slate-600 hover:text-white"
          >
            {lang === 'en' ? '中文' : 'EN'}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:border-slate-600 hover:text-white"
          >
            <LogOut className="h-3 w-3" />
            {t('header.signOut')}
          </button>
        </div>
      </div>
    </header>
  );
}
