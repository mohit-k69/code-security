import React from 'react';
import { motion } from 'motion/react';
import { GitFork, Star, Lock, Globe, FolderGit, ChevronRight, Loader2 } from 'lucide-react';
import { GitlabProject } from '../../../hooks/useGitlab';

interface GitlabProjectListProps {
  projects: GitlabProject[];
  isFetching: boolean;
  searchQuery: string;
  viewStyle: 'grid' | 'list';
  onSelectProject: (project: GitlabProject) => void;
  selectedProjectId: number | null;
}

export function GitlabProjectList({
  projects,
  isFetching,
  searchQuery,
  viewStyle,
  onSelectProject,
  selectedProjectId,
}: GitlabProjectListProps) {
  const filteredProjects = projects.filter((project) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      project.name.toLowerCase().includes(query) ||
      project.path_with_namespace.toLowerCase().includes(query) ||
      (project.description && project.description.toLowerCase().includes(query))
    );
  });

  if (isFetching && projects.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#E24329]" />
        <p className="text-sm font-medium text-gray-600">Loading your GitLab projects...</p>
      </div>
    );
  }

  if (filteredProjects.length === 0) {
    return (
      <div className="py-16 text-center bg-white border border-gray-200 rounded-2xl p-8">
        <FolderGit className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h4 className="text-base font-semibold text-gray-900">No GitLab projects found</h4>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          {searchQuery
            ? `No projects matching "${searchQuery}". Try a different search term.`
            : 'No accessible GitLab projects were found for your account.'}
        </p>
      </div>
    );
  }

  if (viewStyle === 'list') {
    return (
      <div className="space-y-2 w-full">
        {filteredProjects.map((project) => {
          const isSelected = project.id === selectedProjectId;
          return (
            <div
              key={project.id}
              id={`gitlab-project-${project.id}`}
              onClick={() => onSelectProject(project)}
              className={`w-full p-4 rounded-xl border transition-all flex items-center justify-between cursor-pointer group ${
                isSelected
                  ? 'bg-[#FFF5F2] border-[#FDE3DC] shadow-xs'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-700 font-semibold text-sm">
                  {project.avatar_url ? (
                    <img src={project.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span>{project.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {project.name_with_namespace || project.name}
                    </span>
                    <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                      {project.visibility}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5 max-w-md">
                      {project.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
                  {project.star_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>{project.star_count}</span>
                    </span>
                  )}
                  <span>{project.default_branch}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 w-full">
      {filteredProjects.map((project) => {
        const isSelected = project.id === selectedProjectId;
        return (
          <div
            key={project.id}
            id={`gitlab-project-${project.id}`}
            onClick={() => onSelectProject(project)}
            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group min-h-[140px] ${
              isSelected
                ? 'bg-[#FFF5F2] border-[#E24329] shadow-xs'
                : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-700 font-semibold text-xs">
                    {project.avatar_url ? (
                      <img src={project.avatar_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span>{project.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">
                      {project.name}
                    </h4>
                    <p className="text-[11px] text-gray-400 truncate">
                      {project.path_with_namespace}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                  {project.visibility}
                </span>
              </div>

              {project.description && (
                <p className="text-xs text-gray-500 line-clamp-2 mt-2 leading-relaxed">
                  {project.description}
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span className="truncate">Branch: {project.default_branch}</span>
              <span className="text-[#E24329] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                View MRs <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
