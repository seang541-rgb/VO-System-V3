import { Coins, LogOut, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PlanName } from '../lib/plan-limits';
import LanguageSwitcher from './LanguageSwitcher';
import PlanBadge from './PlanBadge';

interface AppHeaderProps {
  creditsBalance: number | null;
  creditsLoading: boolean;
  plan: PlanName;
  onSignOut: () => void;
  projectName?: string;
  localMode?: boolean;
}

function Breadcrumb({ projectName }: { projectName?: string }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isSettings = location.pathname.startsWith('/settings');
  const isProject = location.pathname.startsWith('/project/');

  return (
    <nav className="flex items-center gap-1.5 text-[11px] text-slate-500">
      <Link to="/dashboard" className="hover:text-slate-300 transition-colors">
        {t('nav.dashboard')}
      </Link>
      {isProject && projectName && (
        <>
          <span>/</span>
          <span className="text-slate-300">{projectName}</span>
        </>
      )}
      {isSettings && (
        <>
          <span>/</span>
          <span className="text-slate-300">{t('nav.settings')}</span>
        </>
      )}
    </nav>
  );
}

export default function AppHeader({
  creditsBalance,
  creditsLoading,
  plan,
  onSignOut,
  projectName,
  localMode = false,
}: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Logo + Breadcrumb */}
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-12 items-center justify-center rounded-lg bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-white/20">
              <img
                src="/ideanest-logo.png"
                alt="Idea Nest · VO Copilot"
                className="h-full w-auto object-contain"
              />
            </div>
          </Link>
          <div className="leading-tight">
            <div className="text-[11px] font-medium tracking-wide text-slate-400">
              {t('app.tagline')}
            </div>
            <Breadcrumb projectName={projectName} />
          </div>
        </div>

        {/* Right: Credits, PlanBadge, LanguageSwitcher, Settings, Sign Out */}
        <div className="flex items-center gap-3">
          {localMode ? (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold uppercase text-blue-300">
              {t('nav.localWorkspace')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                <Coins className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  {t('billing.credits')}
                </span>
                <span className="text-sm font-bold text-white">
                  {creditsLoading ? '...' : (creditsBalance ?? '-')}
                </span>
              </div>
              <PlanBadge plan={plan} />
            </>
          )}

          {/* Language Switcher */}
          <LanguageSwitcher />

          {!localMode && (
            <>
              <Link
                to="/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" />
                {t('nav.settings')}
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('nav.signOut')}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
