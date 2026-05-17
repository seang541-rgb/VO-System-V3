import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Menu,
  Plus,
  Settings,
  LogOut,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../hooks/useProjects';
import { useSubscription } from '../hooks/useSubscription';
import { useCredits } from '../hooks/useCredits';
import PlanBadge from './PlanBadge';

interface GlobalSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewProject: () => void;
}

export default function GlobalSidebar({
  collapsed,
  onToggle,
  onNewProject,
}: GlobalSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { activeProjects, loading } = useProjects(user?.id);
  const { plan } = useSubscription(user?.id);
  const { balance: creditsBalance } = useCredits(user?.id);

  // Extract current project ID from route
  const projectMatch = location.pathname.match(/^\/project\/(.+)$/);
  const currentProjectId = projectMatch ? projectMatch[1] : null;

  return (
    <aside
      className={`flex flex-col bg-slate-950 border-r border-slate-800 transition-all duration-200 ease-in-out overflow-hidden ${
        collapsed ? 'w-0 border-r-0' : 'w-[260px] min-w-[260px]'
      }`}
    >
      {/* Top: Toggle + New Project */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
        <span className="text-xs font-semibold text-slate-300 truncate">
          {t('app.name')}
        </span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNewProject}
          className="flex w-full items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <Plus size={14} />
          {t('dashboard.newProject')}
        </button>
      </div>

      {/* Middle: Project List */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {loading ? (
          <div className="px-3 py-2 text-[11px] text-slate-500">
            {t('common.loading')}
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-slate-600">
            <FolderOpen size={24} strokeWidth={1.2} />
            <span className="text-[11px]">{t('dashboard.noProjects')}</span>
          </div>
        ) : (
          activeProjects.map((project) => {
            const isActive = currentProjectId === project.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate(`/project/${project.id}`)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white border-l-2 border-blue-600'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="truncate">{project.name}</span>
              </button>
            );
          })
        )}
      </nav>

      {/* Bottom: User Info */}
      <div className="border-t border-slate-800 px-3 pt-3 pb-3 space-y-2">
        {/* Credits */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {t('billing.credits')}
          </span>
          <span className="text-xs font-bold text-amber-400">
            {creditsBalance ?? '—'}
          </span>
        </div>

        {/* User email + plan */}
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-300 truncate">
              {user?.email ?? '—'}
            </p>
          </div>
          <PlanBadge plan={plan} />
        </div>

        {/* Settings + Sign Out */}
        <div className="flex items-center gap-1">
          <Link
            to="/settings"
            className="flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Settings size={13} />
            {t('nav.settings')}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={13} />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </aside>
  );
}
