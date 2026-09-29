import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface GitlabConnectCardProps {
  onConnectSuccess?: () => void;
  linkError?: string;
  setLinkError: (error: string) => void;
}

export function GitlabConnectCard({
  onConnectSuccess,
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

      console.log('[GITLAB_OAUTH] LINK_IDENTITY_START', {
        provider: 'gitlab',
        redirectTo: redirectUrl.toString(),
        scopes: 'read_user read_api read_repository',
      });

      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'gitlab',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: 'read_user read_api read_repository',
          skipBrowserRedirect: true,
        },
      });

      console.log('[GITLAB_OAUTH] LINK_IDENTITY_RESULT', { data, error });

      if (error) {
        setIsConnecting(false);
        if (error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('identity')) {
          setLinkError('This GitLab account is already connected to another Cody account. Please disconnect it or use a different GitLab account.');
        } else {
          setLinkError(error.message || 'Failed to connect GitLab. Please check your OAuth configuration.');
        }
        return;
      }

      if (data?.url) {
        console.log('[GITLAB_OAUTH] OAUTH_REDIRECT_URL', data.url);
        window.location.assign(data.url);
      } else {
        setIsConnecting(false);
      }
    } catch (err: any) {
      console.error('[GITLAB_OAUTH] LINK_IDENTITY_ERROR', err);
      setIsConnecting(false);
      setLinkError('An unexpected error occurred while connecting GitLab.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col items-center max-w-lg mx-auto text-center shadow-xs"
    >
      {/* GitLab Icon in styled container */}
      <div className="w-16 h-16 rounded-2xl bg-[#FFF5F2] border border-[#FDE3DC] flex items-center justify-center mb-5">
        <svg className="w-9 h-9 text-[#E24329]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L20.6 8.08c-.14-.42-.5-.73-.94-.78-.44-.06-.88.13-1.12.49L16.2 11.4 12 5.09a1.002 1.002 0 00-1.7 0L6.1 11.4 3.76 7.79c-.24-.36-.68-.55-1.12-.49-.44.05-.8.36-.94.78L-.35 14.39c-.19.58-.02 1.22.43 1.63l11.45 8.35c.28.2.65.2.94 0l11.45-8.35c.45-.41.62-1.05.43-1.63z" />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-1.5">
        Connect GitLab
      </h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
        Connect your GitLab account to select projects and inspect merge requests.
      </p>

      {/* Read-Only Security Guarantees */}
      <div className="w-full bg-[#FAFAFA] rounded-xl p-4 mb-6 text-left border border-gray-150 space-y-2.5 text-xs text-gray-600">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Read-Only Minimum Scopes Enforced</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">read_user</strong>: Identifies your GitLab profile</span>
        </div>
        <div className="flex items-start gap-2 text-gray-500 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span><strong className="text-gray-700">read_api & read_repository</strong>: Read-only access to list accessible projects and merge requests</span>
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
        id="connect-gitlab-btn"
        type="button"
        onClick={handleConnectGitlab}
        disabled={isConnecting}
        className="w-full py-3 px-5 bg-[#E24329] hover:bg-[#D03820] text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting to GitLab...</span>
          </>
        ) : (
          <>
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.65 14.39L20.6 8.08c-.14-.42-.5-.73-.94-.78-.44-.06-.88.13-1.12.49L16.2 11.4 12 5.09a1.002 1.002 0 00-1.7 0L6.1 11.4 3.76 7.79c-.24-.36-.68-.55-1.12-.49-.44.05-.8.36-.94.78L-.35 14.39c-.19.58-.02 1.22.43 1.63l11.45 8.35c.28.2.65.2.94 0l11.45-8.35c.45-.41.62-1.05.43-1.63z" />
            </svg>
            <span>Connect GitLab Account</span>
          </>
        )}
      </button>
    </motion.div>
  );
}
