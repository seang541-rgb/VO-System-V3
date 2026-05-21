import { Coins, LogOut, Zap, X } from 'lucide-react';

interface AppHeaderProps {
  creditsBalance: number | null;
  creditsLoading: boolean;
  showLegacyBanner: boolean;
  onCloseBanner: () => void;
  onSignOut: () => void;
}

export default function AppHeader({
  creditsBalance,
  creditsLoading,
  showLegacyBanner,
  onCloseBanner,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 items-center justify-center rounded-lg bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-white/20">
            <img
              src="/ideanest-logo.png"
              alt="Idea Nest · VO Copilot"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-medium tracking-wide text-slate-400">
              VO Copilot · 变更单与合约索赔智能体
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Credits</span>
            <span className="text-sm font-bold text-white">{creditsLoading ? '...' : creditsBalance ?? '-'}</span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
      {showLegacyBanner && (
        <div className="flex items-center justify-between border-t border-blue-500/10 bg-gradient-to-r from-blue-500/5 to-blue-400/5 px-6 py-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Zap className="h-3 w-3 text-blue-400" />
            <span><span className="text-slate-300">原 VO System</span> 已升级为 Idea Nest，所有 VO 比对、索赔分析、Excel 导出功能都在 Copilot 里直接调用。</span>
          </div>
          <button type="button" onClick={onCloseBanner} className="rounded p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </header>
  );
}
