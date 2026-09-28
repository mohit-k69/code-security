import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User as UserIcon,
  Plus,
  X,
  ArrowRight,
  ShieldCheck,
  ArrowLeftRight,
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import {
  type RememberedAccount,
  getRememberedAccounts,
  removeRememberedAccount,
  saveRememberedAccount,
} from '../../lib/accountSwitcher';
import {
  initiateGoogleDirectAuth,
  initiateGithubDirectAuth,
  authenticateEmailDirect,
  confirmSessionTerminated,
} from '../../lib/directAccountAuth';
import { supabase } from '../../lib/supabase';
import {
  OnboardingRecoveryFlow,
  OnboardingEmailConfirmation,
} from './onboarding/OnboardingSteps';
import { identifyUser, trackEvent } from '../../lib/posthog';

interface AccountSwitcherModalProps {
  onAuthenticated?: (user: any) => void;
  onSelectAccount?: (email: string) => void;
  onUseAnotherAccount?: () => void;
  onCancel?: () => void;
  error?: string | null;
}

type SwitcherView =
  | 'list'
  | 'email-password'
  | 'use-another'
  | 'forgot-password'
  | 'recovery-flow'
  | 'email-confirmation';

const GoogleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.36 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.13z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
    />
  </svg>
);

const GithubIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export function AccountSwitcherModal({
  onAuthenticated,
  onSelectAccount,
  onUseAnotherAccount,
  onCancel,
  error: initialError,
}: AccountSwitcherModalProps) {
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [view, setView] = useState<SwitcherView>('list');
  const [selectedAccount, setSelectedAccount] = useState<RememberedAccount | null>(null);

  // Email & Password direct auth state
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(initialError || null);
  const [authLoadingMessage, setAuthLoadingMessage] = useState<string | null>(null);

  // Email confirmation state for new account sign-up
  const [confirmationEmail, setConfirmationEmail] = useState('');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    const list = getRememberedAccounts();
    setAccounts(list);
    if (list.length === 0) {
      setView('use-another');
    }
  }, []);

  const handleRemove = (e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    removeRememberedAccount(email);
    const updated = getRememberedAccounts();
    setAccounts(updated);
    if (updated.length === 0) {
      setView('use-another');
    }
  };

  /**
   * Directly authenticates a remembered account based on its provider.
   */
  const handleAccountClick = async (account: RememberedAccount) => {
    setAuthError(null);

    if (account.provider === 'google') {
      // Direct Google OAuth flow with low-friction login_hint
      setAuthLoadingMessage(`Connecting with Google as ${account.email}...`);
      setIsSubmitting(true);
      const res = await initiateGoogleDirectAuth(account.email);
      if (!res.success) {
        setIsSubmitting(false);
        setAuthLoadingMessage(null);
        setAuthError(res.error || 'Failed to authenticate with Google.');
      }
      return;
    }

    if (account.provider === 'github') {
      // Direct GitHub OAuth flow
      setAuthLoadingMessage(`Connecting with GitHub as ${account.email}...`);
      setIsSubmitting(true);
      const res = await initiateGithubDirectAuth(account.email);
      if (!res.success) {
        setIsSubmitting(false);
        setAuthLoadingMessage(null);
        setAuthError(res.error || 'Failed to authenticate with GitHub.');
      }
      return;
    }

    // Email or legacy account (no provider stored): open compact authentication screen
    setSelectedAccount(account);
    setEmailInput(account.email);
    setPassword('');
    setView('email-password');
  };

  /**
   * Handles email + password submission for both:
   * CASE A: Remembered email account (pre-filled email)
   * CASE B: Use another account -> Continue with Email (new/empty email)
   */
  const handleEmailPasswordSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!normalizedEmail || !password.trim() || isSubmitting) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setAuthError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }

    setAuthError(null);
    setIsSubmitting(true);

    try {
      // Invariant 1: Confirm prior session is terminated before any new authentication
      const isTerminated = await confirmSessionTerminated();
      if (!isTerminated) {
        setIsSubmitting(false);
        setAuthError('Could not terminate previous session. Please try again.');
        return;
      }

      // Invariant 2: If this is an existing remembered account, use signInWithPassword directly
      if (selectedAccount && selectedAccount.email.toLowerCase() === normalizedEmail) {
        const res = await authenticateEmailDirect(selectedAccount.email, password);
        setIsSubmitting(false);
        if (res.success && res.user) {
          identifyUser(res.user.id);
          trackEvent('user_logged_in', { method: 'email', source: 'switcher' });
          if (onAuthenticated) {
            onAuthenticated(res.user);
          }
        } else {
          setAuthError(
            res.error || "We couldn't sign you in with those details. Check your password and try again."
          );
        }
        return;
      }

      // CASE B: User entered new or unremembered email -> Single Continue unified flow
      // 1. First attempt normal email/password sign-in using existing Supabase Auth
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      // 2. If authentication succeeds: sign existing user in and continue
      if (!signInError && signInData.user && signInData.session) {
        const userObj = {
          id: signInData.user.id,
          name:
            signInData.user.user_metadata?.full_name ||
            signInData.user.user_metadata?.first_name ||
            signInData.user.email?.split('@')[0] ||
            'User',
          email: signInData.user.email || normalizedEmail,
          avatar:
            signInData.user.user_metadata?.avatar_url ||
            signInData.user.user_metadata?.picture,
          authProvider: 'email',
        };
        saveRememberedAccount({
          email: userObj.email,
          name: userObj.name,
          avatar: userObj.avatar,
          provider: 'email',
        });
        identifyUser(signInData.user.id);
        trackEvent('user_logged_in', { method: 'email', source: 'switcher' });
        setIsSubmitting(false);
        if (onAuthenticated) {
          onAuthenticated(userObj);
        }
        return;
      }

      // Check specific sign-in errors before attempting signup
      if (signInError) {
        const signInMsg = signInError.message.toLowerCase();
        if (signInMsg.includes('email not confirmed') || signInMsg.includes('email_not_confirmed')) {
          setIsSubmitting(false);
          setAuthError('Please confirm your email address before signing in.');
          return;
        }

        if (signInMsg.includes('rate limit') || (signInError as any).status === 429) {
          setIsSubmitting(false);
          setAuthError('Too many attempts. Please try again later.');
          return;
        }
      }

      // 3. Credentials do not match existing usable email/password account:
      // Attempt existing Supabase email/password signup flow using the entered credentials
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        setIsSubmitting(false);
        const signUpMsg = signUpError.message.toLowerCase();
        const signUpCode = ((signUpError as any).code || '').toLowerCase();
        const isAlreadyRegistered =
          signUpMsg.includes('already registered') ||
          signUpMsg.includes('already exists') ||
          signUpMsg.includes('user already exists') ||
          signUpMsg.includes('email address is already in use') ||
          signUpMsg.includes('identity_already_exists') ||
          signUpCode.includes('already_exists') ||
          signUpCode === 'user_already_exists' ||
          (signUpError as any).status === 422;

        if (isAlreadyRegistered) {
          // Email already registered, but sign-in failed (wrong password).
          // Anti-enumeration: generic error
          setAuthError("We couldn't sign you in with those details. Check your email and password and try again.");
          return;
        }

        if (
          signUpMsg.includes('password') &&
          (signUpMsg.includes('short') || signUpMsg.includes('character') || signUpMsg.includes('weak'))
        ) {
          setAuthError('Password must be at least 6 characters');
          return;
        }

        if (signUpMsg.includes('rate limit') || (signUpError as any).status === 429) {
          setAuthError('Too many attempts. Please try again later.');
          return;
        }

        if (signUpMsg.includes('invalid') && signUpMsg.includes('email')) {
          setAuthError('Please enter a valid email address');
          return;
        }

        setAuthError("We couldn't sign you in with those details. Check your email and password and try again.");
        return;
      }

      // GoTrue duplicate protection check:
      if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        setIsSubmitting(false);
        setAuthError("We couldn't sign you in with those details. Check your email and password and try again.");
        return;
      }

      // 4. If signup succeeds with immediately usable session:
      if (signUpData.session && signUpData.user) {
        const userObj = {
          id: signUpData.user.id,
          name:
            signUpData.user.user_metadata?.full_name ||
            signUpData.user.user_metadata?.first_name ||
            signUpData.user.email?.split('@')[0] ||
            'User',
          email: signUpData.user.email || normalizedEmail,
          avatar:
            signUpData.user.user_metadata?.avatar_url ||
            signUpData.user.user_metadata?.picture,
          authProvider: 'email',
        };
        saveRememberedAccount({
          email: userObj.email,
          name: userObj.name,
          avatar: userObj.avatar,
          provider: 'email',
        });
        identifyUser(signUpData.user.id);
        trackEvent('user_signed_up', { method: 'email', source: 'switcher' });
        setIsSubmitting(false);
        if (onAuthenticated) {
          onAuthenticated(userObj);
        }
        return;
      }

      // 5. If current Supabase project requires email confirmation:
      if (signUpData.user && !signUpData.session) {
        setIsSubmitting(false);
        setConfirmationEmail(normalizedEmail);
        setView('email-confirmation');
        return;
      }

      setIsSubmitting(false);
      setAuthError("We couldn't sign you in with those details. Check your email and password and try again.");
    } catch (err: any) {
      console.error('[DirectAuth] Unexpected error during email authentication:', err);
      setIsSubmitting(false);
      setAuthError("We couldn't sign you in with those details. Check your email and password and try again.");
    }
  };

  /**
   * Sends password reset email.
   */
  const handleSendPasswordReset = async () => {
    const targetEmail = forgotEmail.trim().toLowerCase();
    if (!targetEmail || forgotLoading) return;

    setForgotLoading(true);
    setForgotError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        setForgotError(error.message || 'Failed to send password reset email.');
      } else {
        setForgotSuccess(true);
      }
    } catch {
      setForgotError('Network error. Unable to send password reset email.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-3xl border border-gray-200/80 shadow-xl overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {/* ================================================================ */}
          {/* VIEW 1: REMEMBERED ACCOUNTS LIST                                 */}
          {/* ================================================================ */}
          {view === 'list' && (
            <motion.div
              key="view-list"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              {/* Header */}
              <div className="p-6 sm:p-8 border-b border-gray-100 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#3f2a24] text-white flex items-center justify-center shadow-xs mb-3.5">
                  <ArrowLeftRight className="w-6 h-6 stroke-[2]" />
                </div>
                <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">
                  Switch account
                </h2>
                <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
                  Choose a previously used account to authenticate directly, or sign in with another.
                </p>

                {authLoadingMessage && (
                  <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium w-full flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-amber-800 border-t-transparent rounded-full animate-spin" />
                    <span>{authLoadingMessage}</span>
                  </div>
                )}

                {authError && !authLoadingMessage && (
                  <div className="mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium w-full text-center">
                    {authError}
                  </div>
                )}
              </div>

              {/* Account List */}
              <div className="p-5 sm:p-6 space-y-2.5">
                {accounts.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                      Previously used accounts
                    </span>
                    <div className="space-y-2 mt-2">
                      {accounts.map((acc) => (
                        <div
                          key={acc.email}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleAccountClick(acc)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleAccountClick(acc);
                            }
                          }}
                          className="w-full p-3.5 rounded-2xl border border-gray-200 hover:border-[#3f2a24]/40 hover:bg-[#faf6f4] transition-all flex items-center justify-between group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#3f2a24]/20"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-full bg-[#3f2a24] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden shadow-xs">
                              {acc.avatar ? (
                                <img
                                  src={acc.avatar}
                                  alt={acc.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                (acc.name || acc.email).charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-semibold text-gray-900 truncate group-hover:text-[#3f2a24] transition-colors">
                                  {acc.name}
                                </span>
                                {acc.provider === 'google' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                    <GoogleIcon className="w-2.5 h-2.5" />
                                    Google
                                  </span>
                                )}
                                {acc.provider === 'github' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                    <GithubIcon className="w-2.5 h-2.5" />
                                    GitHub
                                  </span>
                                )}
                                {acc.provider === 'email' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-100">
                                    <Mail className="w-2.5 h-2.5" />
                                    Email
                                  </span>
                                )}
                              </div>
                              <div className="text-[12px] text-gray-500 truncate font-mono">
                                {acc.email}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={(e) => handleRemove(e, acc.email)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                              title="Remove from device list"
                              aria-label={`Remove ${acc.email} from this device`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#3f2a24] group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Use Another Account Button */}
                <button
                  type="button"
                  id="use-another-account-btn"
                  onClick={() => {
                    setAuthError(null);
                    setView('use-another');
                  }}
                  className="w-full p-3.5 rounded-2xl border border-dashed border-gray-300 hover:border-[#3f2a24] hover:bg-gray-50 transition-all flex items-center gap-3.5 text-left cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-[#3f2a24] group-hover:text-white text-gray-600 flex items-center justify-center transition-colors shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-gray-900 group-hover:text-[#3f2a24] transition-colors">
                      Use another account
                    </div>
                    <div className="text-[12px] text-gray-500">
                      Sign in with Google, GitHub, or Email
                    </div>
                  </div>
                </button>
              </div>

              {/* Footer Security Notice */}
              <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>Session terminated before new authentication</span>
                </div>
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="text-gray-500 hover:text-gray-800 font-medium cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* VIEW 2: COMPACT EMAIL/PASSWORD AUTHENTICATION                    */}
          {/* ================================================================ */}
          {view === 'email-password' && (
            <motion.div
              key="view-email-password"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className="p-6 sm:p-8">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setPassword('');
                    if (selectedAccount) {
                      setSelectedAccount(null);
                      setEmailInput('');
                      setView('list');
                    } else {
                      setView(accounts.length > 0 ? 'use-another' : 'list');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 transition-colors mb-5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{selectedAccount ? 'All accounts' : 'Back to options'}</span>
                </button>

                <div className="text-center mb-6">
                  <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">
                    Sign in
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">
                    Sign in or create your account to continue
                  </p>
                </div>

                {/* Identity Card */}
                {selectedAccount && (
                  <div className="p-3.5 rounded-2xl bg-[#faf6f4] border border-[#ebdcd4] flex items-center gap-3.5 mb-5">
                    <div className="w-10 h-10 rounded-full bg-[#3f2a24] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden shadow-xs">
                      {selectedAccount.avatar ? (
                        <img
                          src={selectedAccount.avatar}
                          alt={selectedAccount.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (selectedAccount.name || selectedAccount.email).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-gray-900 truncate">
                        {selectedAccount.name}
                      </div>
                      <div className="text-[12px] text-gray-600 truncate font-mono">
                        {selectedAccount.email}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {authError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div>{authError}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(emailInput || selectedAccount?.email || '');
                          setView('recovery-flow');
                        }}
                        className="mt-1.5 text-[11px] font-semibold text-[#3f2a24] underline cursor-pointer"
                      >
                        Have a recovery code? Use recovery code
                      </button>
                    </div>
                  </div>
                )}

                {/* Email + Password Form */}
                <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="direct-auth-email-input"
                      className="block text-[13px] font-medium text-gray-700 mb-1.5"
                    >
                      Email
                    </label>
                    <div className="relative">
                      <input
                        id="direct-auth-email-input"
                        type="email"
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          if (authError) setAuthError(null);
                        }}
                        placeholder="name@example.com"
                        autoFocus={!selectedAccount}
                        disabled={isSubmitting}
                        className="w-full h-11 px-3.5 text-[14px] text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3f2a24]/20 focus:border-[#3f2a24] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="direct-auth-password-input"
                      className="block text-[13px] font-medium text-gray-700 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="direct-auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (authError) setAuthError(null);
                        }}
                        placeholder="Enter your password"
                        autoFocus={Boolean(selectedAccount)}
                        disabled={isSubmitting}
                        className="w-full h-11 px-3.5 pr-10 text-[14px] text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3f2a24]/20 focus:border-[#3f2a24] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    id="direct-auth-submit-btn"
                    disabled={!emailInput.trim() || !password || isSubmitting}
                    className={`w-full h-11 rounded-xl text-[14px] font-semibold text-white transition-all flex items-center justify-center gap-2 shadow-xs ${
                      !emailInput.trim() || !password || isSubmitting
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-[#3f2a24] hover:bg-[#2c1d19] cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Continuing...</span>
                      </>
                    ) : (
                      'Continue'
                    )}
                  </button>
                </form>

                {/* Forgot Password Link */}
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(emailInput || selectedAccount?.email || '');
                      setForgotSuccess(false);
                      setForgotError('');
                      setView('forgot-password');
                    }}
                    className="text-[12px] font-medium text-gray-500 hover:text-[#3f2a24] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Emergency Recovery Code */}
                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(emailInput || selectedAccount?.email || '');
                      setView('recovery-flow');
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-[#3f2a24] transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                    <span>Have an emergency recovery code?</span>
                  </button>
                </div>

                {/* Alternative Direct Sign-In Options */}
                {selectedAccount && selectedAccount.provider !== 'email' && (
                  <div className="mt-6 pt-5 border-t border-gray-100 space-y-2">
                    <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center mb-3">
                      Or continue with
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAccountClick({ ...selectedAccount, provider: 'google' })}
                      className="w-full h-10 px-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-[13px] font-medium text-gray-700 flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <GoogleIcon className="w-4 h-4" />
                      <span>Google</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAccountClick({ ...selectedAccount, provider: 'github' })}
                      className="w-full h-10 px-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-[13px] font-medium text-gray-700 flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <GithubIcon className="w-4 h-4" />
                      <span>GitHub</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* VIEW 3: COMPACT AUTHENTICATION CHOOSER ("USE ANOTHER ACCOUNT")  */}
          {/* ================================================================ */}
          {view === 'use-another' && (
            <motion.div
              key="view-use-another"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className="p-6 sm:p-8">
                {/* Back button (if there are remembered accounts) */}
                {accounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setView('list');
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 transition-colors mb-5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to accounts</span>
                  </button>
                )}

                <div className="text-center mb-6">
                  <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">
                    Sign in with another account
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">
                    Choose an authentication method to continue
                  </p>
                </div>

                {authLoadingMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-amber-800 border-t-transparent rounded-full animate-spin" />
                    <span>{authLoadingMessage}</span>
                  </div>
                )}

                {authError && !authLoadingMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
                    {authError}
                  </div>
                )}

                <div className="space-y-3">
                  {/* Google */}
                  <button
                    type="button"
                    onClick={async () => {
                      setAuthLoadingMessage('Connecting to Google...');
                      setIsSubmitting(true);
                      const res = await initiateGoogleDirectAuth();
                      if (!res.success) {
                        setIsSubmitting(false);
                        setAuthLoadingMessage(null);
                        setAuthError(res.error || 'Failed to authenticate with Google.');
                      }
                    }}
                    className="w-full min-h-[60px] px-5 py-2.5 rounded-full border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div className="w-9 h-9 rounded-full bg-white border border-gray-200/90 shadow-2xs flex items-center justify-center shrink-0">
                        <GoogleIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-gray-900 group-hover:text-[#3f2a24] transition-colors leading-tight truncate">
                          Continue with Google
                        </div>
                        <div className="text-[12px] text-gray-500 leading-tight mt-0.5 truncate">
                          Fast sign in with Google account
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-[18px] h-[18px] text-gray-400 group-hover:text-[#3f2a24] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* GitHub */}
                  <button
                    type="button"
                    onClick={async () => {
                      setAuthLoadingMessage('Connecting to GitHub...');
                      setIsSubmitting(true);
                      const res = await initiateGithubDirectAuth();
                      if (!res.success) {
                        setIsSubmitting(false);
                        setAuthLoadingMessage(null);
                        setAuthError(res.error || 'Failed to authenticate with GitHub.');
                      }
                    }}
                    className="w-full min-h-[60px] px-5 py-2.5 rounded-full border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div className="w-9 h-9 rounded-full bg-gray-900 text-white shadow-2xs flex items-center justify-center shrink-0">
                        <GithubIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-gray-900 group-hover:text-[#3f2a24] transition-colors leading-tight truncate">
                          Continue with GitHub
                        </div>
                        <div className="text-[12px] text-gray-500 leading-tight mt-0.5 truncate">
                          Connect with your GitHub profile
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-[18px] h-[18px] text-gray-400 group-hover:text-[#3f2a24] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    id="use-another-email-btn"
                    onClick={() => {
                      setSelectedAccount(null);
                      setEmailInput('');
                      setPassword('');
                      setAuthError(null);
                      setView('email-password');
                    }}
                    className="w-full min-h-[60px] px-5 py-2.5 rounded-full border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer text-left select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div className="w-9 h-9 rounded-full bg-[#3f2a24] text-white shadow-2xs flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-gray-900 group-hover:text-[#3f2a24] transition-colors leading-tight truncate">
                          Continue with Email
                        </div>
                        <div className="text-[12px] text-gray-500 leading-tight mt-0.5 truncate">
                          Sign in or create account with password
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-[18px] h-[18px] text-gray-400 group-hover:text-[#3f2a24] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                </div>

                <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail('');
                      setView('recovery-flow');
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-[#3f2a24] transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                    <span>Have an emergency recovery code?</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* VIEW 4: FORGOT PASSWORD                                          */}
          {/* ================================================================ */}
          {view === 'forgot-password' && (
            <motion.div
              key="view-forgot-password"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className="p-6 sm:p-8">
                <button
                  type="button"
                  onClick={() => {
                    setForgotError('');
                    setView('email-password');
                  }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-800 transition-colors mb-5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                {forgotSuccess ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3.5">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-[18px] font-bold text-gray-900 mb-1.5">
                      Reset link sent
                    </h3>
                    <p className="text-[13px] text-gray-600 max-w-xs mx-auto leading-relaxed mb-6">
                      We sent password reset instructions to{' '}
                      <span className="font-semibold text-gray-900">{forgotEmail}</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => setView('email-password')}
                      className="w-full h-11 rounded-xl bg-[#3f2a24] text-white text-[14px] font-semibold hover:bg-[#2c1d19] transition-colors cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-center mb-6">
                      <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">
                        Reset password
                      </h2>
                      <p className="text-[13px] text-gray-500 mt-1">
                        Enter your email to receive a password reset link
                      </p>
                    </div>

                    {forgotError && (
                      <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
                        {forgotError}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="forgot-email-input"
                          className="block text-[13px] font-medium text-gray-700 mb-1.5"
                        >
                          Email address
                        </label>
                        <input
                          id="forgot-email-input"
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full h-11 px-3.5 text-[14px] text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3f2a24]/20 focus:border-[#3f2a24] transition-all"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSendPasswordReset}
                        disabled={!forgotEmail.trim() || forgotLoading}
                        className={`w-full h-11 rounded-xl text-[14px] font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                          !forgotEmail.trim() || forgotLoading
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-[#3f2a24] hover:bg-[#2c1d19] cursor-pointer'
                        }`}
                      >
                        {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                      </button>

                      <div className="pt-3 text-center">
                        <button
                          type="button"
                          onClick={() => setView('recovery-flow')}
                          className="text-[12px] font-medium text-[#3f2a24] hover:underline cursor-pointer"
                        >
                          Have a recovery code? Use recovery code
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* VIEW 5: EMERGENCY RECOVERY CODE FLOW                             */}
          {/* ================================================================ */}
          {view === 'recovery-flow' && (
            <motion.div
              key="view-recovery-flow"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="p-6 sm:p-8"
            >
              <OnboardingRecoveryFlow
                initialEmail={emailInput || selectedAccount?.email || forgotEmail || ''}
                onBackToSignIn={() => {
                  setView('email-password');
                }}
              />
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* VIEW 6: EMAIL CONFIRMATION REQUIRED                              */}
          {/* ================================================================ */}
          {view === 'email-confirmation' && (
            <motion.div
              key="view-email-confirmation"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="p-6 sm:p-8"
            >
              <OnboardingEmailConfirmation
                email={confirmationEmail || emailInput}
                onBackToSignIn={() => {
                  setAuthError(null);
                  setView('email-password');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
