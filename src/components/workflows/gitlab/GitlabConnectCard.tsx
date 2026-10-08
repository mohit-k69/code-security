import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface GitlabConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
  gitlabUsername?: string | null;
}

export function GitlabConnectCard({
  linkError,
  setLinkError,
  gitlabUsername,
}: GitlabConnectCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0);

  const executeConnectGitlab = async () => {
    setModalStep(0);
    if (isConnecting) return;
    setIsConnecting(true);
    setLinkError('');
    try {
      console.log('[GITLAB_OAUTH] CONNECT_BUTTON_CLICKED');
      const redirectUrl = new URL(window.location.origin);
      redirectUrl.pathname = window.location.pathname;
      redirectUrl.searchParams.set('workflow', 'gitlab');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setLinkError('You must be logged in to connect GitLab.');
          setIsConnecting(false);
          return;
        }

        const res = await fetch('/api/auth/gitlab/init', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          let errorMsg = 'Failed to initiate GitLab connection.';
          try {
            const body = await res.json();
            if (body.error) errorMsg = body.error;
          } catch {}
          setLinkError(errorMsg);
          setIsConnecting(false);
          return;
        }

        const data = await res.json();
        if (data.url) {
          console.log('[GITLAB_OAUTH] OAUTH_REDIRECT_URL', data.url);
          window.location.assign(data.url);
        } else {
          setLinkError('Invalid response from server.');
          setIsConnecting(false);
        }
      } catch (err: any) {
        console.error('[GITLAB_OAUTH] INIT_ERROR', err);
        setIsConnecting(false);
        setLinkError('An unexpected error occurred while connecting GitLab.');
      }
    } catch (err: any) {
      console.error('[GITLAB_OAUTH] LINK_IDENTITY_ERROR', err);
      setIsConnecting(false);
      setLinkError('An unexpected error occurred while connecting GitLab.');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="flex flex-col items-center max-w-md px-4 w-full">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
          <svg className="w-8 h-8 text-[#E24329]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.65 14.39L20.6 8.08c-.14-.42-.5-.73-.94-.78-.44-.06-.88.13-1.12.49L16.2 11.4 12 5.09a1.002 1.002 0 00-1.7 0L6.1 11.4 3.76 7.79c-.24-.36-.68-.55-1.12-.49-.44.05-.8.36-.94.78L-.35 14.39c-.19.58-.02 1.22.43 1.63l11.45 8.35c.28.2.65.2.94 0l11.45-8.35c.45-.41.62-1.05.43-1.63z" />
          </svg>
        </div>
        <h3 className="text-[18px] font-semibold text-gray-900 mb-2">Connect GitLab</h3>
        <p className="text-[14px] text-gray-500 mb-6">Connect your GitLab account to access your repositories.</p>
        <button
          id="connect-gitlab-btn"
          type="button"
          onClick={() => setModalStep(1)}
          disabled={isConnecting}
          className={`px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4 flex items-center justify-center gap-2 cursor-pointer ${
            isConnecting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-800'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            'Connect GitLab'
          )}
        </button>
        <p className="text-[12px] text-gray-400 mt-1 mb-2">
          Already signed in to GitLab? To connect a different account, sign out of GitLab.com first.
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-left border border-gray-100 relative">
            <button
              type="button"
              onClick={() => setModalStep(0)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">Connect a GitLab account</h3>
            <div className="text-[14px] text-gray-500 mb-6">
              <p>GitLab will use the account currently signed in to GitLab.com.</p>
            </div>
            
            <div className="space-y-2">
              <button 
                type="button"
                onClick={executeConnectGitlab}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer text-center"
              >
                {gitlabUsername ? `Continue as @${gitlabUsername}` : 'Continue with current account'}
              </button>
              
              <button 
                type="button"
                onClick={() => setModalStep(2)}
                className="w-full py-2.5 px-4 bg-white text-gray-700 border border-gray-200 rounded-full text-[14px] font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer text-center"
              >
                Switch GitLab account
              </button>
            </div>
          </div>
        </div>
      )}

      {modalStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-left border border-gray-100">
            <h3 className="text-[18px] font-semibold text-gray-900 mb-3">Switch your GitLab account</h3>
            <div className="text-[14px] text-gray-600 space-y-4 mb-6">
              <p>We'll open GitLab.com in a new tab.</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Sign out of your current GitLab account.</li>
                <li>Sign in to the GitLab account you want to use.</li>
                <li>Return to Cody and click Connect GitLab again.</li>
              </ol>
              <p>Cody will then connect the GitLab account you're currently signed in to.</p>
            </div>
            
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalStep(1)}
                className="px-4 py-2 text-[14px] font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open('https://gitlab.com/', '_blank');
                  setModalStep(0);
                }}
                className="px-4 py-2 text-[14px] font-medium text-white bg-gray-900 border border-transparent rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer"
              >
                Open GitLab.com
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
