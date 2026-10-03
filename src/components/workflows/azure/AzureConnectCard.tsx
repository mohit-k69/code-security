import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface AzureConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
}

export function AzureConnectCard({
  linkError,
  setLinkError,
}: AzureConnectCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectAzure = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setLinkError('');
    try {
      const redirectUrl = new URL(window.location.origin);
      redirectUrl.pathname = window.location.pathname;
      redirectUrl.searchParams.set('workflow', 'azure');

      try {
        window.sessionStorage?.setItem('cody_oauth_flow_provider', 'azure');
        window.localStorage?.setItem('cody_oauth_flow_provider', 'azure');
      } catch {}

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'azure',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: '499b84de-3a79-4731-8f21-7e9b08479570/vso.code offline_access',
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setIsConnecting(false);
        if (error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('identity')) {
          setLinkError('This Microsoft / Azure DevOps account is already connected to another Cody account.');
        } else {
          setLinkError(error.message || 'Failed to connect Azure DevOps. Please check your configuration.');
        }
        return;
      }

      if (data?.url) {
        window.location.assign(data.url);
      } else {
        setIsConnecting(false);
      }
    } catch (err: any) {
      console.error('Azure DevOps Connect Error:', err);
      setIsConnecting(false);
      setLinkError('An unexpected error occurred while connecting Azure DevOps.');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="flex flex-col items-center max-w-md px-4 w-full">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
          <svg className="w-8 h-8 text-[#0078D4]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.5 4.5l-9-3.75a1.5 1.5 0 0 0-1.2 0l-9 3.75A1.5 1.5 0 0 0 2.25 5.9v12.2a1.5 1.5 0 0 0 1.05 1.4l9 3.75a1.5 1.5 0 0 0 1.2 0l9-3.75a1.5 1.5 0 0 0 1.05-1.4V5.9a1.5 1.5 0 0 0-1.05-1.4z" />
          </svg>
        </div>
        <h3 className="text-[18px] font-semibold text-gray-900 mb-2">Connect Azure DevOps</h3>
        <p className="text-[14px] text-gray-500 mb-6">Connect your Azure DevOps account to access your repositories.</p>
        <button
          id="connect-azure-btn"
          type="button"
          onClick={handleConnectAzure}
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
            'Connect Azure DevOps'
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
