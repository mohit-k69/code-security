import React, { useState } from 'react';
import { AlertTriangle, Github, Loader2, X } from 'lucide-react';

interface SetupIncompleteErrorProps {
  providerTokenSetupError: string;
  retryProviderTokenSetup: () => void;
  handleConnectGithub?: () => void;
}

export function SetupIncompleteError({ providerTokenSetupError, retryProviderTokenSetup, handleConnectGithub }: SetupIncompleteErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-sm">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-[18px] font-semibold text-gray-900 mb-2">GitHub Setup Incomplete</h3>
      <p className="text-[14px] text-gray-500 max-w-md mb-6">{providerTokenSetupError}</p>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button 
          onClick={retryProviderTokenSetup}
          className="px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors shadow-sm"
        >
          Retry Setup
        </button>
        {handleConnectGithub && (
          <button 
            onClick={handleConnectGithub}
            className="px-6 py-2.5 bg-white text-gray-800 border border-gray-300 rounded-full text-[14px] font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            Reconnect GitHub
          </button>
        )}
      </div>
    </div>
  );
}

interface ConnectionErrorProps {
  githubReposError: string;
  handleConnectGithub: () => void;
  linkError: string;
  isConnecting?: boolean;
  githubUsername?: string | null;
}

export function ConnectionError({ githubReposError, handleConnectGithub, linkError, isConnecting = false, githubUsername }: ConnectionErrorProps) {
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0);

  const executeConnect = () => {
    setModalStep(0);
    handleConnectGithub();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="flex flex-col items-center max-w-md px-4 w-full">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
          <Github className="w-8 h-8 text-gray-700" />
        </div>
        <h3 className="text-[18px] font-semibold text-gray-900 mb-2">Connect GitHub</h3>
        <p className="text-[14px] text-gray-500 mb-6">Connect your GitHub account to access your repositories.</p>
        <button 
          onClick={() => setModalStep(1)}
          disabled={isConnecting}
          className={`px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4 flex items-center justify-center gap-2 ${
            isConnecting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-800'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting to GitHub...</span>
            </>
          ) : (
            'Connect GitHub'
          )}
        </button>
        <p className="text-[12px] text-gray-400 mt-1 mb-2">
          Already signed in to GitHub? To connect a different account, sign out of GitHub.com first.
        </p>
        {linkError && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600 text-left w-full mt-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{linkError}</span>
            </div>
          </div>
        )}
      </div>

      {modalStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[480px] w-full p-8 text-left border border-gray-100 relative">
            <button
              type="button"
              onClick={() => setModalStep(0)}
              className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            
            <h3 className="text-[18px] font-semibold text-gray-900 mb-3">Connect a GitHub account</h3>
            <div className="text-[14px] text-gray-500 mb-8">
              <p>GitHub will use the account currently signed in to GitHub.com.</p>
            </div>
            
            <div className="space-y-3">
              <button 
                type="button"
                onClick={executeConnect}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer text-center"
              >
                {githubUsername ? `Continue as @${githubUsername}` : 'Continue with current account'}
              </button>
              
              <button 
                type="button"
                onClick={() => setModalStep(2)}
                className="w-full py-2.5 px-4 bg-white text-gray-700 border border-gray-200 rounded-full text-[14px] font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer text-center"
              >
                Switch GitHub account
              </button>
            </div>
          </div>
        </div>
      )}

      {modalStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[480px] w-full p-8 text-left border border-gray-100 relative">
            <button
              type="button"
              onClick={() => setModalStep(0)}
              className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-[18px] font-semibold text-gray-900 mb-3">Switch your GitHub account</h3>
            <div className="text-[14px] text-gray-600 mb-8">
              <p className="mb-4">We'll open GitHub.com in a new tab so you can switch accounts.</p>
              <ol className="list-decimal pl-5 space-y-2 mb-4">
                <li>Sign out of your current GitHub account.</li>
                <li>Sign in to the GitHub account you want to connect.</li>
                <li>Return to Cody and click Connect GitHub again.</li>
              </ol>
              <p className="text-gray-500">Cody will connect the GitHub account you're currently signed in to.</p>
            </div>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  window.open('https://github.com/', '_blank');
                  setModalStep(0);
                }}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer text-center"
              >
                Open GitHub.com
              </button>
              <button
                type="button"
                onClick={() => setModalStep(1)}
                className="w-full py-2.5 px-4 bg-white text-gray-700 border border-gray-200 rounded-full text-[14px] font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer text-center"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
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
