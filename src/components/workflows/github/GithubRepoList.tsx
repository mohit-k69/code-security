import React from 'react';
import { Github, Lock, Globe, CodeXml, Clock, Check } from 'lucide-react';
import { GithubRepo } from '../../../hooks/useGithub';

interface GithubRepoListProps {
  githubRepos: GithubRepo[];
  githubSearchQuery: string;
  selectedRepoId: number | null;
  handleAnalyze: (repo: GithubRepo) => void;
  viewStyle: 'grid' | 'list';
}

export function GithubRepoList({
  githubRepos,
  githubSearchQuery,
  selectedRepoId,
  handleAnalyze,
  viewStyle
}: GithubRepoListProps) {
  if (githubRepos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <Github className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-[14px]">No repositories found.</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${viewStyle === 'grid' ? 'md:grid-cols-2' : ''} gap-4 overflow-y-auto pb-12 pr-2 pt-3 pl-1 custom-scrollbar`}>
      {githubRepos
        .filter(repo => {
          if (!githubSearchQuery.trim()) return true;
          const terms = githubSearchQuery.toLowerCase().split(/\s+/);
          const searchableText = `${repo.name} ${repo.description || ''} ${repo.language || ''}`.toLowerCase();
          return terms.every(term => searchableText.includes(term));
        })
        .map((repo) => (
        <div 
          key={repo.id}
          className={`relative bg-white border rounded-xl transition-all hover:shadow-md ${
            selectedRepoId === repo.id ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-sm' : 'border-gray-200'
          } ${viewStyle === 'grid' ? 'p-5 flex flex-col gap-4' : 'p-3 flex items-center gap-4'}`}
        >
          {selectedRepoId === repo.id && (
            <div className={`absolute bg-emerald-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white ${viewStyle === 'grid' ? '-top-2.5 -right-2.5 w-6 h-6' : '-top-1.5 -right-1.5 w-5 h-5'}`}>
              <Check className={`text-white stroke-[3] ${viewStyle === 'grid' ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
            </div>
          )}

          {viewStyle === 'grid' ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3 min-w-0">
                  <img src={repo.owner.avatar_url} alt="Owner" className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 border border-gray-200" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[15px] font-semibold text-gray-900 truncate" title={repo.name}>{repo.name}</h4>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                        {repo.private ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        {repo.private ? 'Private' : 'Public'}
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-500 truncate mt-0.5" title={repo.full_name}>{repo.full_name}</p>
                  </div>
                </div>
              </div>

              <p className="text-[13px] text-gray-600 line-clamp-2 min-h-[40px]">
                {repo.description || <span className="italic text-gray-400">No description provided.</span>}
              </p>

              <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4 text-[12px] text-gray-500 justify-end w-full">
                  {repo.language && (
                    <span className="flex items-center gap-1.5">
                      <CodeXml className="w-3.5 h-3.5" />
                      {repo.language}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(repo.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-end gap-2 w-full">
                  <button 
                    onClick={() => handleAnalyze(repo)}
                    className="px-4 py-1 rounded-full text-[12px] font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Analyze
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <img src={repo.owner.avatar_url} alt="Owner" className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 border border-gray-200" />
                <div className="flex items-center gap-3 min-w-0">
                  <h4 className="text-[15px] font-semibold text-gray-900 truncate" title={repo.name}>{repo.name}</h4>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                    {repo.private ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>
              </div>

              <div className="flex items-center flex-shrink-0 ml-4">
                <button 
                  onClick={() => handleAnalyze(repo)}
                  className="px-5 py-2 rounded-full text-[13px] font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap"
                >
                  Analyze
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
