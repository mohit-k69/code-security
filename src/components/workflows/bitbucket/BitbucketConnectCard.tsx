import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'bitbucket',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: 'account repository pullrequest',
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
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col items-center max-w-lg mx-auto text-center shadow-xs"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#F0F4FF] border border-[#D8E2FF] flex items-center justify-center mb-5">
        <svg className="w-9 h-9 text-[#0052CC]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M.75 3.75A.75.75 0 0 1 1.5 3h21a.75.75 0 0 1 .75.75c0 .088-.015.176-.045.26l-3.5 15.5a.75.75 0 0 1-.732.585H4.527a.75.75 0 0 1-.732-.585l-3.5-15.5a.75.75 0 0 1-.045-.26zm4.195 2.25l2.768 12.25h8.574l2.768-12.25H4.945z" />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-1.5">
        Connect Bitbucket Cloud
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
        Connect your Bitbucket Cloud account to select repositories and review pull requests.
      </p>

      {/* Read-Only Security Guarantees */}
      <div className="w-full bg-[#FAFAFA] rounded-xl p-4 mb-6 text-left border border-gray-150 space-y-2.5 text-xs text-gray-600">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Read-Only Minimum Scopes Enforced</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">account</strong>: Identifies your profile</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">repository & pullrequest</strong>: Read-only access to list repositories, diffs, and pull requests</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 pl-6 pt-1 border-t border-gray-200/60">
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>Never requests write permissions or executes repository code</span>
        </div>
      </div>

      {linkError && (
        <div className="w-full mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5 text-left">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{linkError}</span>
        </div>
      )}

      <button
        id="connect-bitbucket-btn"
        type="button"
        onClick={handleConnectBitbucket}
        disabled={isConnecting}
        className="w-full py-3 px-5 bg-[#0052CC] hover:bg-[#0747A6] text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting to Bitbucket...</span>
          </>
        ) : (
          <>
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M.75 3.75A.75.75 0 0 1 1.5 3h21a.75.75 0 0 1 .75.75c0 .088-.015.176-.045.26l-3.5 15.5a.75.75 0 0 1-.732.585H4.527a.75.75 0 0 1-.732-.585l-3.5-15.5a.75.75 0 0 1-.045-.26zm4.195 2.25l2.768 12.25h8.574l2.768-12.25H4.945z" />
            </svg>
            <span>Connect Bitbucket Account</span>
          </>
        )}
      </button>
    </motion.div>
  );
}
