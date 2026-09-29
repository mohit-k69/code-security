import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Lock, Globe, Clock, Check, GitBranch, FolderGit, Loader2 } from 'lucide-react';
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
  const shouldReduceMotion = useReducedMotion();
  const transitionConfig = shouldReduceMotion 
    ? { duration: 0 } 
    : { duration: 0.45, ease: [0.16, 1, 0.3, 1] };

  if (isFetching && projects.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#E24329]" />
        <p className="text-sm font-medium text-gray-600">Loading your GitLab projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-16">
        <FolderGit className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-[14px]">No GitLab projects found.</p>
      </div>
    );
  }

  const filteredProjects = projects.filter((project) => {
    if (selectedProjectId !== null) {
      return project.id === selectedProjectId;
    }
    if (!searchQuery.trim()) return true;
    const terms = searchQuery.toLowerCase().split(/\s+/);
    const searchableText = `${project.name} ${project.path_with_namespace || ''} ${project.description || ''}`.toLowerCase();
    return terms.every(term => searchableText.includes(term));
  });

  if (filteredProjects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-16">
        <FolderGit className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-[14px]">No projects matching &quot;{searchQuery}&quot;.</p>
      </div>
    );
  }

  return (
    <motion.div 
      layout
      transition={transitionConfig}
      className={`grid grid-cols-1 ${viewStyle === 'grid' && selectedProjectId === null ? 'md:grid-cols-2' : ''} gap-4 overflow-y-auto pb-12 pr-2 pt-3 pl-1 custom-scrollbar`}
    >
      <AnimatePresence mode="popLayout">
        {filteredProjects.map((project) => {
          const isSelected = selectedProjectId === project.id;
          const isFullCard = viewStyle === 'grid' || isSelected;
          const isPrivate = project.visibility === 'private';
          const avatarUrl = project.avatar_url || project.namespace?.avatar_url;

          return (
            <motion.div 
              key={project.id}
              id={`gitlab-project-${project.id}`}
              layout
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ 
                opacity: 0,
                scale: 0.96,
                transition: shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
              }}
              transition={transitionConfig}
              onClick={() => onSelectProject(project)}
              className={`relative bg-white border rounded-xl hover:shadow-md cursor-pointer ${
                isSelected ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-sm' : 'border-gray-200'
              } ${isFullCard ? 'p-5 flex flex-col gap-4' : 'p-4 flex items-center gap-4'}`}
            >
              {isSelected && (
                <motion.div 
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={transitionConfig}
                  className="absolute bg-emerald-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white -top-2.5 -right-2.5 w-6 h-6 z-10"
                >
                  <Check className="text-white stroke-[3] w-3.5 h-3.5" />
                </motion.div>
              )}

              {isFullCard ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3 min-w-0">
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt="Owner" 
                          className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 border border-gray-200 object-cover" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#FFF5F2] flex-shrink-0 border border-[#FDE3DC] flex items-center justify-center text-[#E24329] font-semibold text-sm">
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-[15px] font-semibold text-gray-900 truncate" title={project.name}>
                            {project.name}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                            {isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                            {isPrivate ? 'Private' : 'Public'}
                          </span>
                        </div>
                        <p className="text-[13px] text-gray-500 truncate mt-0.5" title={project.path_with_namespace}>
                          {project.path_with_namespace}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[13px] text-gray-600 line-clamp-2 min-h-[40px]">
                    {project.description || <span className="italic text-gray-400">No description provided.</span>}
                  </p>

                  <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-4 text-[12px] text-gray-500 justify-end w-full">
                      {project.default_branch && (
                        <span className="flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5" />
                          {project.default_branch}
                        </span>
                      )}
                      {project.last_activity_at && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(project.last_activity_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 w-full">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProject(project);
                        }}
                        className={`px-4 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title="Select Project"
                      >
                        {isSelected ? "Selected" : "Select Project"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Owner" 
                        className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 border border-gray-200 object-cover" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#FFF5F2] flex-shrink-0 border border-[#FDE3DC] flex items-center justify-center text-[#E24329] font-semibold text-sm">
                        {project.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex items-center gap-3 min-w-0">
                      <h4 className="text-[15px] font-semibold text-gray-900 truncate" title={project.name}>
                        {project.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                        {isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        {isPrivate ? 'Private' : 'Public'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center flex-shrink-0 ml-4">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(project);
                      }}
                      className="px-5 py-2 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
                      title="Select Project"
                    >
                      Select Project
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
