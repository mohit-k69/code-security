import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col items-center max-w-lg mx-auto text-center shadow-xs"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#EBF6FF] border border-[#CCE7FF] flex items-center justify-center mb-5">
        <svg className="w-9 h-9 text-[#0078D4]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.5 4.5l-9-3.75a1.5 1.5 0 0 0-1.2 0l-9 3.75A1.5 1.5 0 0 0 2.25 5.9v12.2a1.5 1.5 0 0 0 1.05 1.4l9 3.75a1.5 1.5 0 0 0 1.2 0l9-3.75a1.5 1.5 0 0 0 1.05-1.4V5.9a1.5 1.5 0 0 0-1.05-1.4z" />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-1.5">
        Connect Azure DevOps
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
        Connect your Microsoft Entra account to select Azure DevOps repositories and review pull requests.
      </p>

      {/* Read-Only Security Guarantees */}
      <div className="w-full bg-[#FAFAFA] rounded-xl p-4 mb-6 text-left border border-gray-150 space-y-2.5 text-xs text-gray-600">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Read-Only Minimum Scopes Enforced</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">vso.code</strong>: Read access to repositories, diffs, and pull requests</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">Microsoft Entra ID</strong>: Industry standard secure authentication</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 pl-6 pt-1 border-t border-gray-200/60">
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>Never requests write permissions (no vso.code_write, no vso.code_manage)</span>
        </div>
      </div>

      {linkError && (
        <div className="w-full mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5 text-left">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{linkError}</span>
        </div>
      )}

      <button
        id="connect-azure-btn"
        type="button"
        onClick={handleConnectAzure}
        disabled={isConnecting}
        className="w-full py-3 px-5 bg-[#0078D4] hover:bg-[#006CBE] text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting to Microsoft...</span>
          </>
        ) : (
          <>
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.5 4.5l-9-3.75a1.5 1.5 0 0 0-1.2 0l-9 3.75A1.5 1.5 0 0 0 2.25 5.9v12.2a1.5 1.5 0 0 0 1.05 1.4l9 3.75a1.5 1.5 0 0 0 1.2 0l9-3.75a1.5 1.5 0 0 0 1.05-1.4V5.9a1.5 1.5 0 0 0-1.05-1.4z" />
            </svg>
            <span>Connect Microsoft Account</span>
          </>
        )}
      </button>
    </motion.div>
  );
}
