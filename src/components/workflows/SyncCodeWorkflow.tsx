import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Github, GitBranch, Terminal, Shield, ArrowRight } from 'lucide-react';

interface SyncCodeWorkflowProps {
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'sync') => void;
  isGithubConnected?: boolean;
  isGitlabConnected?: boolean;
  isBitbucketConnected?: boolean;
  isAzureConnected?: boolean;
}

interface ProviderItem {
  id: 'github' | 'gitlab' | 'bitbucket' | 'azure';
  name: string;
  description: string;
  isAvailable: boolean;
  icon: React.ReactNode;
  badge?: string;
}

export function SyncCodeWorkflow({
  setActiveWorkflow,
  isGithubConnected = false,
  isGitlabConnected = false,
  isBitbucketConnected = false,
  isAzureConnected = false,
}: SyncCodeWorkflowProps) {
  const providers: ProviderItem[] = [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Public & private repositories, branches and pull requests',
      isAvailable: true,
      icon: <Github className="w-6 h-6 text-gray-900" />,
      badge: isGithubConnected ? 'Connected' : 'Available',
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'GitLab projects and merge request inspection',
      isAvailable: true,
      icon: (
        <svg className="w-6 h-6 text-[#E24329]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L20.6 8.08c-.14-.42-.5-.73-.94-.78-.44-.06-.88.13-1.12.49L16.2 11.4 12 5.09a1.002 1.002 0 00-1.7 0L6.1 11.4 3.76 7.79c-.24-.36-.68-.55-1.12-.49-.44.05-.8.36-.94.78L-.35 14.39c-.19.58-.02 1.22.43 1.63l11.45 8.35c.28.2.65.2.94 0l11.45-8.35c.45-.41.62-1.05.43-1.63z" />
        </svg>
      ),
      badge: isGitlabConnected ? 'Connected' : 'Available',
    },
    {
      id: 'bitbucket',
      name: 'Bitbucket',
      description: 'Bitbucket Cloud repositories and pull requests',
      isAvailable: true,
      icon: (
        <svg className="w-6 h-6 text-[#0052CC]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M1.38 2.05a1.18 1.18 0 00-.97.59 1.16 1.16 0 00-.09 1.14l4.24 16.63c.12.48.56.81 1.05.81h12.78c.46 0 .87-.29 1.01-.73l4.28-16.71a1.16 1.16 0 00-.09-1.14 1.18 1.18 0 00-.97-.59H1.38zm12.35 13.56H9.37l-1.39-6.33h7.13l-1.38 6.33z" />
        </svg>
      ),
      badge: isBitbucketConnected ? 'Connected' : 'Available',
    },
    {
      id: 'azure',
      name: 'Azure DevOps',
      description: 'Azure Repos, branching policies and pull request reviews',
      isAvailable: true,
      icon: (
        <svg className="w-6 h-6 text-[#0078D4]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.5 4.5L14.25.75v5.25L4.5 9v6l9.75 3v5.25l8.25-3.75V4.5zM14.25 15L6.75 12.38V10.5l7.5-2.62v7.12z" />
        </svg>
      ),
      badge: isAzureConnected ? 'Connected' : 'Available',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-2 sm:px-4 py-2 sm:py-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <button
          id="sync-code-back-btn"
          type="button"
          onClick={() => setActiveWorkflow('none')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer -ml-2"
          aria-label="Back to home"
          title="Back to home"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-[20px] sm:text-[22px] font-semibold text-gray-900 tracking-tight">
            Sync Code
          </h2>
          <p className="text-[13px] sm:text-[14px] text-gray-500 mt-0.5">
            Connect your code repository
          </p>
        </div>
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4.5 w-full">
        {providers.map((provider) => {
          const isEnabled = provider.isAvailable;

          return (
            <div
              key={provider.id}
              id={`provider-card-${provider.id}`}
              onClick={() => {
                if (isEnabled) {
                  setActiveWorkflow(provider.id);
                }
              }}
              className={`relative rounded-2xl border p-5 sm:p-6 transition-all flex flex-col justify-between min-h-[140px] sm:min-h-[155px] ${
                isEnabled
                  ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md cursor-pointer group'
                  : 'bg-gray-50/70 border-gray-200/70 cursor-not-allowed opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      isEnabled
                        ? 'bg-gray-100 group-hover:scale-105 transition-transform'
                        : 'bg-white border border-gray-200/60'
                    }`}
                  >
                    {provider.icon}
                  </div>

                  {provider.badge && (
                    <span
                      className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                        provider.badge === 'Connected'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : provider.badge === 'Available'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {provider.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-[15px] sm:text-[16px] font-semibold text-gray-900 flex items-center gap-1.5">
                  {provider.name}
                  {isEnabled && (
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 transition-all" />
                  )}
                </h3>
                <p className="text-[12.5px] sm:text-[13px] text-gray-500 mt-1 leading-relaxed">
                  {provider.description}
                </p>
              </div>

              {isEnabled && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[12px] font-medium text-gray-600 group-hover:text-gray-900">
                  <span>
                    {provider.id === 'github'
                      ? (isGithubConnected ? 'Open connected repositories' : 'Connect GitHub account')
                      : (isGitlabConnected ? 'Open connected projects' : 'Connect GitLab account')}
                  </span>
                  <span className="text-gray-400 group-hover:text-gray-600">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
