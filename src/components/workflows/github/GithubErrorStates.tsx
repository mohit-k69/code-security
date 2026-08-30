import React from 'react';
import { AlertTriangle, Github, Loader2 } from 'lucide-react';

interface SetupIncompleteErrorProps {
  providerTokenSetupError: string;
  retryProviderTokenSetup: () => void;
}

export function SetupIncompleteError({ providerTokenSetupError, retryProviderTokenSetup }: SetupIncompleteErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-sm">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-[18px] font-semibold text-gray-900 mb-2">GitHub Setup Incomplete</h3>
      <p className="text-[14px] text-gray-500 max-w-md mb-6">{providerTokenSetupError}</p>
      <button 
        onClick={retryProviderTokenSetup}
        className="px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors shadow-sm"
      >
        Retry Setup
      </button>
    </div>
  );
}

interface ConnectionErrorProps {
  githubReposError: string;
  handleConnectGithub: () => void;
  linkError: string;
  isConnecting?: boolean;
}

export function ConnectionError({ githubReposError, handleConnectGithub, linkError, isConnecting = false }: ConnectionErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="flex flex-col items-center max-w-md px-4">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
          <Github className="w-8 h-8 text-gray-700" />
        </div>
        <h3 className="text-[18px] font-semibold text-gray-900 mb-2">Connect GitHub</h3>
        <p className="text-[14px] text-gray-500 mb-6">Connect your GitHub account to access your repositories.</p>
        <button 
          onClick={handleConnectGithub}
          disabled={isConnecting}
          className={`px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4 flex items-center justify-center gap-2 ${
            isConnecting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-800'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            'Connect GitHub'
          )}
        </button>
        {linkError && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600 text-left w-full mt-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{linkError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface GenericErrorProps {
  githubReposError: string;
  fetchGithubRepositories: () => void;
}

export function GenericError({ githubReposError, fetchGithubRepositories }: GenericErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-[16px] font-semibold text-gray-900 mb-2">Failed to load repositories</h3>
      <p className="text-[14px] text-gray-500 max-w-md">{githubReposError}</p>
      <button 
        onClick={fetchGithubRepositories}
        className="mt-6 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
