import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface BitbucketConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
  bitbucketUsername?: string | null;
}

export function BitbucketConnectCard({
  linkError,
  setLinkError,
  bitbucketUsername,
}: BitbucketConnectCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [modalStep, setModalStep] = useState<0 | 1 | 2>(0);

  const executeConnectBitbucket = async () => {
    setModalStep(0);
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
            'Connect Bitbucket'
          )}
        </button>
        <p className="text-[12px] text-gray-400 mt-1 mb-2">
          Already signed in to Bitbucket? To connect a different account, sign out of Bitbucket first.
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
            
            <h3 className="text-[18px] font-semibold text-gray-900 mb-3">Connect a Bitbucket account</h3>
            <div className="text-[14px] text-gray-500 mb-8">
              <p>Bitbucket will use the account currently signed in to Bitbucket.</p>
            </div>
            
            <div className="space-y-3">
              <button 
                type="button"
                onClick={executeConnectBitbucket}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer text-center"
              >
                {bitbucketUsername ? `Continue as @${bitbucketUsername}` : 'Continue with current account'}
              </button>
              
              <button 
                type="button"
                onClick={() => setModalStep(2)}
                className="w-full py-2.5 px-4 bg-white text-gray-700 border border-gray-200 rounded-full text-[14px] font-medium hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer text-center"
              >
                Switch Bitbucket account
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

            <h3 className="text-[18px] font-semibold text-gray-900 mb-3">Switch your Bitbucket account</h3>
            <div className="text-[14px] text-gray-600 mb-8">
              <p className="mb-4">We'll open Bitbucket in a new tab so you can switch accounts.</p>
              <ol className="list-decimal pl-5 space-y-2 mb-4">
                <li>Sign out of your current Bitbucket account.</li>
                <li>Sign in to the Bitbucket account you want to connect.</li>
                <li>Return to Cody and click Connect Bitbucket again.</li>
              </ol>
              <p className="text-gray-500">Cody will connect the Bitbucket account you're currently signed in to.</p>
            </div>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  window.open('https://bitbucket.org/', '_blank');
                  setModalStep(0);
                }}
                className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer text-center"
              >
                Open Bitbucket
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
