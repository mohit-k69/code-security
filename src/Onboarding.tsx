import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowLeftRight } from 'lucide-react';
import { supabase } from './lib/supabase';
import { isValidEmailFormat, isValidEmailDomain, normalizeEmail } from './components/auth/onboarding/emailUtils';
import { trackEvent, identifyUser, trackPageView } from './lib/posthog';
import { saveRememberedAccount, getRememberedAccounts } from './lib/accountSwitcher';

import {
  OnboardingEmailStep,
  OnboardingForgotPassword,
  OnboardingRecoveryFlow,
  OnboardingEmailConfirmation,
} from './components/auth/onboarding/OnboardingSteps';

import { CodeVibeIcon } from './components/common/CodeVibeLogo';
import { type User } from './hooks/useAuth';

interface OnboardingProps {
  onLogin: (user: User) => void;
  initialEmail?: string;
  onOpenAccountSwitcher?: () => void;
}

export default function Onboarding({ onLogin, initialEmail = '', onOpenAccountSwitcher }: OnboardingProps) {
  // Form state
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Email confirmation state (for Supabase projects requiring email verification)
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');

  // Handle external prefilled email (e.g. from account switcher)
  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);
  
  // Track onboarding view & handle OAuth URL errors
  useEffect(() => {
    trackPageView('/onboarding', 'Cody - Welcome');

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');
    if (oauthError) {
      const isAccessDenied = oauthError.toLowerCase().includes('denied') || oauthError.toLowerCase().includes('access_denied');
      const userFriendlyError = isAccessDenied
        ? 'Sign-in was cancelled.'
        : `Authentication error: ${oauthError}`;
      setEmailError(userFriendlyError);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const handleAuthError = (e: any) => {
      setIsLoading(false);
      setIsGoogleLoading(false);
      if (e.detail?.message) {
        setEmailError(e.detail.message);
      }
    };

    window.addEventListener('codevibe_auth_error', handleAuthError);
    return () => window.removeEventListener('codevibe_auth_error', handleAuthError);
  }, []);

  // Forgot password & recovery state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRecoveryFlow, setShowRecoveryFlow] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleEmailContinue = useCallback(async () => {
    if (isLoading) return;
    const rawEmail = email;
    if (!rawEmail.trim()) return;

    const normalizedEmail = normalizeEmail(rawEmail);

    if (!isValidEmailFormat(normalizedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (!isValidEmailDomain(normalizedEmail)) {
      setEmailError('Please use a valid email from a recognized provider');
      return;
    }

    if (!password.trim()) {
      setEmailError('Please enter your password');
      return;
    }

    if (password.length < 6) {
      setEmailError('Password must be at least 6 characters');
      return;
    }

    setEmailError('');
    setIsLoading(true);

    try {
      // 1. First attempt normal email/password sign-in using existing Supabase Auth
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      // 2. If authentication succeeds: sign existing user in and continue into Cody normally
      if (!signInError && signInData.user && signInData.session) {
        const userObj: User = {
          id: signInData.user.id,
          name:
            signInData.user.user_metadata?.full_name ||
            signInData.user.user_metadata?.first_name ||
            signInData.user.email?.split('@')[0] ||
            'User',
          email: signInData.user.email || normalizedEmail,
          avatar: signInData.user.user_metadata?.avatar_url || signInData.user.user_metadata?.picture,
        };
        saveRememberedAccount({
          email: userObj.email,
          name: userObj.name,
          avatar: userObj.avatar,
          provider: 'email',
        });
        identifyUser(signInData.user.id);
        trackEvent('user_logged_in', { method: 'email' });
        onLogin(userObj);
        return;
      }

      // Check specific sign-in errors before attempting signup
      if (signInError) {
        const signInMsg = signInError.message.toLowerCase();
        if (signInMsg.includes('email not confirmed') || signInMsg.includes('email_not_confirmed')) {
          setEmailError('Please confirm your email address before signing in.');
          return;
        }

        if (signInMsg.includes('rate limit') || (signInError as any).status === 429) {
          setEmailError('Too many attempts. Please try again later.');
          return;
        }
      }

      // 3. Credentials do not correspond to an existing usable email/password account:
      // Attempt existing Supabase email/password signup flow using the same entered email/password
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
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
          // 6. Email already registered, but sign-in failed (wrong password).
          // Do NOT expose unnecessary account-existence info; show generic error:
          setEmailError("We couldn't sign you in with those details. Check your email and password and try again.");
          return;
        }

        if (signUpMsg.includes('password') && (signUpMsg.includes('short') || signUpMsg.includes('character') || signUpMsg.includes('weak'))) {
          setEmailError('Password must be at least 6 characters');
          return;
        }

        if (signUpMsg.includes('rate limit') || (signUpError as any).status === 429) {
          setEmailError('Too many attempts. Please try again later.');
          return;
        }

        if (signUpMsg.includes('invalid') && signUpMsg.includes('email')) {
          setEmailError('Please enter a valid email address');
          return;
        }

        // Generic error to prevent enumeration
        setEmailError("We couldn't sign you in with those details. Check your email and password and try again.");
        return;
      }

      // GoTrue duplicate protection check:
      // When email confirmation is enabled and user already exists, GoTrue returns user with empty identities: []
      if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        setEmailError("We couldn't sign you in with those details. Check your email and password and try again.");
        return;
      }

      // 4. If signup succeeds with an immediately usable session:
      if (signUpData.session && signUpData.user) {
        const userObj: User = {
          id: signUpData.user.id,
          name:
            signUpData.user.user_metadata?.full_name ||
            signUpData.user.user_metadata?.first_name ||
            signUpData.user.email?.split('@')[0] ||
            'User',
          email: signUpData.user.email || normalizedEmail,
          avatar: signUpData.user.user_metadata?.avatar_url || signUpData.user.user_metadata?.picture,
        };
        saveRememberedAccount({
          email: userObj.email,
          name: userObj.name,
          avatar: userObj.avatar,
          provider: 'email',
        });
        identifyUser(signUpData.user.id);
        trackEvent('user_signed_up', { method: 'email' });
        onLogin(userObj);
        return;
      }

      // 5. If current Supabase project requires email confirmation:
      if (signUpData.user && !signUpData.session) {
        setConfirmationEmail(normalizedEmail);
        setShowEmailConfirmation(true);
        return;
      }

      // Fallback
      setEmailError("We couldn't sign you in with those details. Check your email and password and try again.");
    } catch (err: any) {
      setEmailError(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, onLogin, isLoading]);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setEmailError('');
      trackEvent('oauth_signin_initiated', { provider: 'google', mode: 'unified' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;

      if (data?.url) {
        if (window.self !== window.top) {
          const popup = window.open(data.url, 'oauth_popup', 'width=500,height=650');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            window.location.assign(data.url);
          }
        } else {
          window.location.assign(data.url);
        }
      }
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      let message = err.message || 'Failed to authenticate with Google. Please try again.';
      if (message.toLowerCase().includes('popup')) {
        message = 'Popup was blocked by your browser. Please allow popups or open the app in a new tab.';
      }
      setEmailError(message);
      setIsGoogleLoading(false);
    }
  };

  const handleGithubSignIn = async () => {
    try {
      setIsLoading(true);
      setEmailError('');
      trackEvent('oauth_signin_initiated', { provider: 'github', mode: 'unified' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
          scopes: 'repo read:user user:email',
          skipBrowserRedirect: true,
          queryParams: { prompt: 'consent' },
        },
      });
      if (error) throw error;

      if (data?.url) {
        if (window.self !== window.top) {
          const popup = window.open(data.url, 'oauth_popup', 'width=500,height=650');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            window.location.assign(data.url);
          }
        } else {
          window.location.assign(data.url);
        }
      }
    } catch (err: any) {
      setEmailError(err.message || 'Failed to authenticate with GitHub.');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = useCallback(async () => {
    if (!forgotEmail.trim()) return;
    if (!isValidEmailFormat(forgotEmail.trim())) {
      setForgotError('Please enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: window.location.origin,
      });
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  }, [forgotEmail]);

  const renderRightContent = () => {
    if (showRecoveryFlow) {
      return (
        <OnboardingRecoveryFlow
          initialEmail={email || forgotEmail}
          onBackToSignIn={() => {
            setShowRecoveryFlow(false);
            setShowForgotPassword(false);
          }}
        />
      );
    }

    if (showEmailConfirmation) {
      return (
        <OnboardingEmailConfirmation
          email={confirmationEmail || email}
          onBackToSignIn={() => {
            setShowEmailConfirmation(false);
            setEmailError('');
          }}
        />
      );
    }

    if (showForgotPassword) {
      return (
        <OnboardingForgotPassword
          forgotSuccess={forgotSuccess}
          forgotEmail={forgotEmail}
          setForgotEmail={setForgotEmail}
          forgotError={forgotError}
          setForgotError={setForgotError}
          forgotLoading={forgotLoading}
          handleForgotPassword={handleForgotPassword}
          setShowForgotPassword={setShowForgotPassword}
          setForgotSuccess={setForgotSuccess}
          onOpenRecoveryFlow={() => {
            setShowForgotPassword(false);
            setShowRecoveryFlow(true);
          }}
        />
      );
    }

    return (
      <OnboardingEmailStep
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        emailError={emailError}
        setEmailError={setEmailError}
        isLoading={isLoading}
        handleEmailContinue={handleEmailContinue}
        handleGithubSignIn={handleGithubSignIn}
        handleGoogleSignIn={handleGoogleSignIn}
        isGoogleLoading={isGoogleLoading}
        setShowForgotPassword={setShowForgotPassword}
        setShowRecoveryFlow={setShowRecoveryFlow}
        setForgotEmail={setForgotEmail}
        setForgotError={setForgotError}
        setForgotSuccess={setForgotSuccess}
      />
    );
  };

  return (
    <div className="flex h-screen w-full font-sans antialiased">
      <div className="hidden lg:flex w-[580px] bg-[#3A2722] flex-col justify-between p-16 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L5 30l25 25 25-25z' fill='none' stroke='%2349332D' stroke-width='0.75'/%3E%3C/svg%3E")`,
        }} />

        <div className="relative z-10" />

        <div className="relative z-10">
          <h1 className="text-[#F7F4F0] text-[36px] font-bold leading-tight mb-4">
            Check the security<br />of your code.
          </h1>
          <p className="text-[#B9AAA2] text-[16px] leading-relaxed max-w-[340px]">
            Analyze your code for security issues, best practices, and quality — all in seconds.
          </p>
        </div>

        <div className="relative z-10 text-[#8F7D74] text-[13px]">
          © 2026 Cody
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 sm:px-8 py-8 lg:py-0 overflow-y-auto lg:overflow-hidden min-h-[100dvh] lg:min-h-0">
        <div className="w-full max-w-[380px] lg:max-w-[440px] flex flex-col items-center my-auto">
          <div className="flex items-center gap-3 mb-[28px]">
            <CodeVibeIcon size={34} variant="dark" className="shrink-0 cody-logo-rotate" />
            <span className="font-bold text-[31px] text-[#3A2722] tracking-tight leading-none">Cody</span>
          </div>

          {onOpenAccountSwitcher && getRememberedAccounts().length > 0 && (
            <div className="mb-4">
              <button
                type="button"
                id="onboarding-switch-account-btn"
                onClick={onOpenAccountSwitcher}
                className="text-[12px] font-semibold text-[#3f2a24] hover:text-[#2c1d19] bg-[#faf6f4] hover:bg-[#f5eeea] border border-[#ebdcd4] px-3.5 py-1.5 rounded-full transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#3f2a24]" />
                <span>Switch to another account</span>
              </button>
            </div>
          )}

          <div className="w-full relative min-h-0 lg:min-h-0 flex flex-col items-center justify-start lg:justify-center pt-0 lg:pt-0">
            <AnimatePresence mode="wait">
              {renderRightContent()}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
