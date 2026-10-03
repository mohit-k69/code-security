import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface BitbucketConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
}

export function BitbucketConnectCard({
  linkError,
  setLinkError,
}: BitbucketConnectCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectBitbucket = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setLinkError('');
    try {
      const redirectUrl = new URL(window.location.origin);
      redirectUrl.pathname = window.location.pathname;
      redirectUrl.searchParams.set('workflow', 'bitbucket');

      try {
        window.sessionStorage?.setItem('cody_oauth_flow_provider', 'bitbucket');
        window.localStorage?.setItem('cody_oauth_flow_provider', 'bitbucket');
      } catch {}

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'bitbucket',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: 'account repository pullrequest',
          queryParams: {
            scope: 'account repository pullrequest',
          },
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setIsConnecting(false);
        if (error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('identity')) {
          setLinkError('This Bitbucket account is already connected to another Cody account. Please disconnect it or use a different Bitbucket account.');
        } else {
          setLinkError(error.message || 'Failed to connect Bitbucket. Please check your OAuth configuration.');
        }
        return;
      }

      if (data?.url) {
        window.location.assign(data.url);
      } else {
        setIsConnecting(false);
      }
    } catch (err: any) {
      console.error('Bitbucket Connect Error:', err);
      setIsConnecting(false);
      setLinkError('An unexpected error occurred while connecting Bitbucket.');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="flex flex-col items-center max-w-md px-4 w-full">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
          <svg className="w-8 h-8 text-[#0052CC]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M.75 3.75A.75.75 0 0 1 1.5 3h21a.75.75 0 0 1 .75.75c0 .088-.015.176-.045.26l-3.5 15.5a.75.75 0 0 1-.732.585H4.527a.75.75 0 0 1-.732-.585l-3.5-15.5a.75.75 0 0 1-.045-.26zm4.195 2.25l2.768 12.25h8.574l2.768-12.25H4.945z" />
          </svg>
        </div>
        <h3 className="text-[18px] font-semibold text-gray-900 mb-2">Connect Bitbucket</h3>
        <p className="text-[14px] text-gray-500 mb-6">Connect your Bitbucket account to access your repositories.</p>
        <button
          id="connect-bitbucket-btn"
          type="button"
          onClick={handleConnectBitbucket}
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
            'Connect Bitbucket'
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
