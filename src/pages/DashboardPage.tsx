import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FolderOpen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../hooks/useProjects';
import { useSubscription } from '../hooks/useSubscription';
import { canCreateProject } from '../lib/plan-limits';
import ProjectCard from '../components/ProjectCard';
import CreateProjectModal from '../components/CreateProjectModal';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProjects, archivedProjects, loading, createProject, archiveProject } =
    useProjects(user?.id);
  const { plan } = useSubscription(user?.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

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

  const handleArchive = async (projectId: string) => {
    await archiveProject(projectId);
    toast.success(t('toast.projectArchived'));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-white">{t('dashboard.title')}</h1>
        <button
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          onClick={handleNewProject}
        >
          <Plus size={14} />
          {t('dashboard.newProject')}
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-4">
          <p className="text-[11px] text-slate-400">{t('dashboard.activeProjects')}</p>
          <p className="mt-1 text-lg font-bold text-white">
            {loading ? '—' : activeProjects.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-4">
          <p className="text-[11px] text-slate-400">{t('dashboard.comparisonsThisMonth')}</p>
          <p className="mt-1 text-lg font-bold text-white">—</p>
        </div>
      </div>

      {/* Active projects grid */}
      {loading ? (
        <div className="text-xs text-slate-400">{t('common.loading')}</div>
      ) : activeProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
          <FolderOpen size={40} strokeWidth={1.2} />
          <p className="text-xs">{t('dashboard.noProjects')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeProjects.map((project) => (
            <div key={project.id}>
              <ProjectCard project={project} onArchive={handleArchive} />
            </div>
          ))}
        </div>
      )}

      {/* Archived section */}
      {archivedProjects.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-3"
            onClick={() => setArchivedExpanded((v) => !v)}
          >
            {archivedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('dashboard.archived')} ({archivedProjects.length})
          </button>
          {archivedExpanded && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archivedProjects.map((project) => (
                <div key={project.id}>
                  <ProjectCard project={project} onArchive={handleArchive} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create project modal */}
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
