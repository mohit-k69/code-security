import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { isValidEmailFormat, isValidEmailDomain, normalizeEmail } from './components/auth/onboarding/emailUtils';
import { trackEvent, identifyUser, trackPageView } from './lib/posthog';

import {
  OnboardingEmailStep,
  OnboardingForgotPassword,
  OnboardingSignupSuccess
} from './components/auth/onboarding/OnboardingSteps';

import { CodeVibeIcon } from './components/common/CodeVibeLogo';
import { type User } from './hooks/useAuth';

interface OnboardingProps {
  onLogin: (user: User) => void;
}

export default function Onboarding({ onLogin }: OnboardingProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [direction] = useState(1);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  
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

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
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

    if (mode === 'signin') {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          let friendlyError = error.message;
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            friendlyError = 'Invalid email or password. Please try again.';
          } else if (error.message.toLowerCase().includes('email not confirmed')) {
            friendlyError = 'Please confirm your email address before signing in.';
          }
          setEmailError(friendlyError);
          return;
        }

        if (data.user) {
          identifyUser(data.user.id);
          trackEvent('user_logged_in', { method: 'email' });
          onLogin({
            id: data.user.id,
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.first_name || data.user.email?.split('@')[0] || 'User',
            email: data.user.email || normalizedEmail,
          });
        }
      } catch (err: any) {
        setEmailError(err.message || 'An unexpected authentication error occurred.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Signup: create account directly — duplicate email prevention
      try {
        // 1. Authoritative Backend Check for duplicate account against Supabase Auth
        let isDuplicate = false;
        try {
          const res = await fetch('/api/auth/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail }),
          });
          if (res.ok) {
            const result = await res.json();
            if (result.exists) {
              isDuplicate = true;
            }
          }
        } catch (fetchErr) {
          console.warn('Backend duplicate check unavailable, falling back to Auth signUp validation:', fetchErr);
        }

        if (isDuplicate) {
          setEmailError('Account already exists. Please use a different email.');
          return;
        }

        // 2. Perform Supabase Auth SignUp
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          const errLower = error.message.toLowerCase();
          if (
            errLower.includes('already registered') ||
            errLower.includes('already exists') ||
            errLower.includes('user already exists') ||
            errLower.includes('email address is already in use') ||
            errLower.includes('identity_already_exists') ||
            (error as any).status === 422
          ) {
            setEmailError('Account already exists. Please use a different email.');
          } else if (errLower.includes('password') && (errLower.includes('short') || errLower.includes('character'))) {
            setEmailError('Password must be at least 6 characters');
          } else {
            setEmailError(error.message || 'An unexpected signup error occurred.');
          }
          return;
        }

        // 3. Check for empty identities array (GoTrue email confirmation behavior for existing accounts)
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setEmailError('Account already exists. Please use a different email.');
          return;
        }

        trackEvent('user_signed_up', { method: 'email' });
        setSignupSuccess(true);
      } catch (err: any) {
        setEmailError(err.message || 'An unexpected signup error occurred.');
      } finally {
        setIsLoading(false);
      }
    }
  }, [email, password, mode, onLogin, isLoading]);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setEmailError('');
      trackEvent('oauth_signin_initiated', { provider: 'google', mode });

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
      trackEvent('oauth_signin_initiated', { provider: 'github', mode });

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
        />
      );
    }

    if (signupSuccess) {
      return (
        <OnboardingSignupSuccess
          setSignupSuccess={setSignupSuccess}
          setMode={setMode}
          setEmail={setEmail}
          setPassword={setPassword}
        />
      );
    }

    return (
      <OnboardingEmailStep
        mode={mode}
        setMode={setMode}
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
        setForgotEmail={setForgotEmail}
        setForgotError={setForgotError}
        setForgotSuccess={setForgotSuccess}
        direction={direction}
      />
    );
  };

  return (
    <div className="flex h-screen w-full font-sans antialiased">
      <div className="hidden lg:flex w-[580px] bg-[#3A2722] flex-col justify-between p-16 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L5 30l25 25 25-25z' fill='none' stroke='%2349332D' stroke-width='0.75'/%3E%3C/svg%3E")`,
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <CodeVibeIcon size={34} variant="light" className="shrink-0 drop-shadow-[0_2px_8px_rgba(36,23,19,0.4)]" />
            <span className="font-bold text-2xl text-[#F7F4F0] tracking-wide">Cody</span>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-[#F7F4F0] text-[36px] font-bold leading-tight mb-4">
            Check the vibe<br />of your code.
          </h1>
          <p className="text-[#B9AAA2] text-[16px] leading-relaxed max-w-[340px]">
            Analyze your code for security issues, best practices, and quality — all in seconds.
          </p>
        </div>

        <div className="relative z-10 text-[#8F7D74] text-[13px]">
          © 2026 Cody
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-white px-6 overflow-hidden">
        <div className="w-full max-w-[440px] flex flex-col items-center">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <CodeVibeIcon size={28} variant="dark" className="shrink-0" />
            <span className="font-bold text-xl text-[#3A2722] tracking-wide">Cody</span>
          </div>

          <div className="w-full relative min-h-[520px] flex flex-col items-center justify-start pt-6">
            <AnimatePresence mode="wait">
              {renderRightContent()}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
