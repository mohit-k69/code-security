import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface GitlabConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
}

export function GitlabConnectCard({
  linkError,
  setLinkError,
}: GitlabConnectCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectGitlab = async () => {
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
          onClick={handleConnectGitlab}
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
    </div>
  );
}
