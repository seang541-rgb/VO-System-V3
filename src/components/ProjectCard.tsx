import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Clock, FileBox, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../hooks/useProjects';

interface ProjectCardProps {
  project: Project;
  onArchive: (projectId: string) => void | Promise<void>;
}

export default function ProjectCard({ project, onArchive }: ProjectCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const isArchived = project.status === 'archived';

  const updatedDate = new Date(project.updated_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`relative rounded-2xl border border-slate-700 bg-slate-800/60 p-4 transition-all ${
        hovered && !isArchived ? 'border-blue-600/30' : ''
      } ${isArchived ? 'opacity-60' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Archive button — top right, appears on hover */}
      {!isArchived && hovered && (
        <button
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-amber-400 transition-colors"
          title={t('project.archive')}
          onClick={(e) => {
            e.preventDefault();
            onArchive(project.id);
          }}
        >
          <Archive size={14} />
        </button>
      )}

      {/* Card body */}
      <Link to={`/project/${project.id}`} className="block">
        <div className="flex items-start gap-3">
          <FolderOpen
            size={18}
            className={isArchived ? 'text-slate-500 mt-0.5 shrink-0' : 'text-blue-500 mt-0.5 shrink-0'}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate leading-tight">{project.name}</p>
            {project.description && (
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {project.description}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <FileBox size={11} />
          {project.file_count ?? 0} {t('dashboard.files')}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {updatedDate}
        </span>
      </div>
    </div>
  );
}
