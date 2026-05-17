import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Menu } from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import GlobalSidebar from '../components/GlobalSidebar';
import CreateProjectModal from '../components/CreateProjectModal';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../hooks/useProjects';
import { useSubscription } from '../hooks/useSubscription';
import { canCreateProject } from '../lib/plan-limits';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeProjects, createProject } = useProjects(user?.id);
  const { plan } = useSubscription(user?.id);

  // Auto-collapse sidebar when navigating into a project workspace
  const isProjectRoute = /^\/project\//.test(location.pathname);
  const prevIsProjectRouteRef = useRef(isProjectRoute);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(isProjectRoute);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    // Auto-collapse when entering a project route
    if (isProjectRoute && !prevIsProjectRouteRef.current) {
      setSidebarCollapsed(true);
    }
    // Auto-expand when leaving a project route
    if (!isProjectRoute && prevIsProjectRouteRef.current) {
      setSidebarCollapsed(false);
    }
    prevIsProjectRouteRef.current = isProjectRoute;
  }, [isProjectRoute]);

  const handleNewProject = () => {
    if (!canCreateProject(plan, activeProjects.length)) {
      toast.error(
        `Plan limit reached — upgrade to create more than ${activeProjects.length} projects`,
      );
      return;
    }
    setModalOpen(true);
  };

  const handleCreate = async (name: string, description?: string) => {
    const project = await createProject(name, description);
    if (project) {
      toast.success(t('toast.projectCreated'));
      navigate(`/project/${project.id}`);
    } else {
      toast.error(t('toast.error'));
    }
  };

  return (
    <AuthGuard>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
          },
        }}
      />
      <div className="flex h-screen w-full overflow-hidden bg-slate-900 font-sans text-slate-300">
        {/* Sidebar */}
        <GlobalSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onNewProject={handleNewProject}
        />

        {/* Main content area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Slim top bar — only shows hamburger when sidebar is collapsed */}
          {sidebarCollapsed && (
            <div className="flex items-center px-4 py-2 border-b border-slate-800">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label="Open sidebar"
              >
                <Menu size={18} />
              </button>
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <Outlet context={{ onNewProject: handleNewProject }} />
          </main>
        </div>
      </div>

      {/* Create project modal (shared across all pages) */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </AuthGuard>
  );
}
