import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from './lib/supabase';
import { isValidEmailFormat, isValidEmailDomain, normalizeEmail } from './components/auth/onboarding/emailUtils';
import { trackEvent, identifyUser, trackPageView } from './lib/posthog';

import {
  OnboardingEmailStep,
  OnboardingForgotPassword,
} from './components/auth/onboarding/OnboardingSteps';

import { CodeVibeIcon } from './components/common/CodeVibeLogo';
import { type User } from './hooks/useAuth';

interface OnboardingProps {
  onLogin: (user: User) => void;
}

export default function Onboarding({ onLogin }: OnboardingProps) {
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Duplicate email pre-check & existing user state
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);

  // Mobile-only entrance animation state (Apple-style smooth C scale & content reveal)
  const [shouldPlayEntrance] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isMobile = window.innerWidth < 768;
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return isMobile && !prefersReduced;
  });

  const [entranceCompleted, setEntranceCompleted] = useState(() => !shouldPlayEntrance);

  const logoAnchorRef = useRef<HTMLDivElement>(null);

  const [startCoords, setStartCoords] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 42, y: 220 };
    const vpCenterX = window.innerWidth / 2;
    const vpCenterY = window.innerHeight / 2;
    // On mobile, header logo is roughly 42px left of center and approx 180px from top
    const estimatedLogoX = vpCenterX - 42;
    const estimatedLogoY = Math.max(window.innerHeight * 0.24, 180);
    return {
      x: Math.round(vpCenterX - estimatedLogoX), // 42px
      y: Math.round(vpCenterY - estimatedLogoY), // ~210-230px (positive = viewport center below header)
    };
  });

  useLayoutEffect(() => {
    if (!shouldPlayEntrance || entranceCompleted) return;
    if (logoAnchorRef.current) {
      const rect = logoAnchorRef.current.getBoundingClientRect();
      const logoCenterX = rect.left + rect.width / 2;
      const logoCenterY = rect.top + rect.height / 2;
      const vpCenterX = window.innerWidth / 2;
      const vpCenterY = window.innerHeight / 2;
      setStartCoords({
        x: Math.round(vpCenterX - logoCenterX),
        y: Math.round(vpCenterY - logoCenterY),
      });
    }
  }, [shouldPlayEntrance, entranceCompleted]);

  useEffect(() => {
    if (shouldPlayEntrance && !entranceCompleted) {
      const timer = setTimeout(() => {
        setEntranceCompleted(true);
      }, 2300);
      return () => clearTimeout(timer);
    }
  }, [shouldPlayEntrance, entranceCompleted]);

  const checkedEmailsCache = useRef<Record<string, boolean>>({});
  const checkDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkAbortControllerRef = useRef<AbortController | null>(null);
  const checkReqIdRef = useRef<number>(0);
  const lastCheckedEmailRef = useRef<string>('');
  const inFlightEmailRef = useRef<string | null>(null);

  const checkEmailDuplicate = useCallback(async (rawEmail: string, immediate = false) => {
    const normalized = normalizeEmail(rawEmail);

    // If incomplete or invalid format/domain, do not issue an API request
    if (!normalized || !isValidEmailFormat(normalized) || !isValidEmailDomain(normalized)) {
      if (checkDebounceTimerRef.current) {
        clearTimeout(checkDebounceTimerRef.current);
        checkDebounceTimerRef.current = null;
      }
      if (checkAbortControllerRef.current) {
        checkAbortControllerRef.current.abort();
        checkAbortControllerRef.current = null;
      }
      inFlightEmailRef.current = null;
      setIsCheckingEmail(false);
      setIsDuplicateEmail(false);
      setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
      return;
    }

    // Check cache first to avoid redundant API requests
    if (checkedEmailsCache.current[normalized] !== undefined) {
      const exists = checkedEmailsCache.current[normalized];
      lastCheckedEmailRef.current = normalized;
      inFlightEmailRef.current = null;
      setIsCheckingEmail(false);
      setIsDuplicateEmail(exists);
      if (exists) {
        setEmailError('Account already exists. Please use a different email.');
      } else {
        setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
      }
      return;
    }

    // Cancel any pending debounce timer
    if (checkDebounceTimerRef.current) {
      clearTimeout(checkDebounceTimerRef.current);
      checkDebounceTimerRef.current = null;
    }

    const runCheck = async () => {
      // Safely abort any in-flight request for previous email
      if (checkAbortControllerRef.current) {
        checkAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      checkAbortControllerRef.current = controller;
      const currentReqId = ++checkReqIdRef.current;
      inFlightEmailRef.current = normalized;

      setIsCheckingEmail(true);

      // Client-side safety timeout (5500ms): guarantees request never remains pending indefinitely in browser
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5500);

      try {
        const res = await fetch('/api/auth/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalized }),
          signal: controller.signal,
        });

        if (currentReqId !== checkReqIdRef.current) return;

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const result = await res.json();
          if (currentReqId !== checkReqIdRef.current) return;

          if (typeof result.exists === 'boolean') {
            const exists = result.exists;
            checkedEmailsCache.current[normalized] = exists;
            lastCheckedEmailRef.current = normalized;
            setIsDuplicateEmail(exists);

            if (exists) {
              setEmailError('Account already exists. Please use a different email.');
            } else {
              setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
            }
          } else {
            // Controlled error response (e.g. EMAIL_CHECK_UNAVAILABLE): do not block signup
            setIsDuplicateEmail(false);
            setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
          }
        } else {
          // Temporary server/network error (503/504/500): do not falsely claim email exists; do not block signup
          setIsDuplicateEmail(false);
          setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        // Temporary network failure: do not falsely claim email exists; submit path remains final authority
        if (currentReqId === checkReqIdRef.current) {
          setIsDuplicateEmail(false);
          setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
        }
      } finally {
        clearTimeout(timeoutId);
        if (inFlightEmailRef.current === normalized) {
          inFlightEmailRef.current = null;
        }
        if (currentReqId === checkReqIdRef.current) {
          setIsCheckingEmail(false);
        }
      }
    };

    if (immediate) {
      runCheck();
    } else {
      checkDebounceTimerRef.current = setTimeout(runCheck, 500);
    }
  }, []);

  // Debounced duplicate check on email change
  useEffect(() => {
    const normalized = normalizeEmail(email);
    if (normalized !== lastCheckedEmailRef.current) {
      setIsDuplicateEmail(false);
      setEmailError((prev) => (prev === 'Account already exists. Please use a different email.' ? '' : prev));
      checkEmailDuplicate(email, false);
    }
  }, [email, checkEmailDuplicate]);

  // Trigger immediate check on blur if changed and not already in flight or checked
  const handleEmailBlur = useCallback(() => {
    const normalized = normalizeEmail(email);
    if (normalized && isValidEmailFormat(normalized) && isValidEmailDomain(normalized)) {
      // If already cached, or if this exact email is currently in flight, do not re-trigger or abort
      if (checkedEmailsCache.current[normalized] === undefined && inFlightEmailRef.current !== normalized) {
        checkEmailDuplicate(email, true);
      }
    }
  }, [email, checkEmailDuplicate]);
  
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

    try {
      // 1. Authoritative check if user exists (check state, cache, or call /api/auth/check-email)
      let isExisting = isDuplicateEmail;

      if (!isExisting && checkedEmailsCache.current[normalizedEmail] === undefined) {
        try {
          const res = await fetch('/api/auth/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: normalizedEmail }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            const result = await res.json();
            if (result.exists) {
              isExisting = true;
              setIsDuplicateEmail(true);
              checkedEmailsCache.current[normalizedEmail] = true;
            } else if (result.exists === false) {
              checkedEmailsCache.current[normalizedEmail] = false;
            }
          }
        } catch (fetchErr) {
          console.warn('Backend check-email error:', fetchErr);
        }
      }

      if (isExisting) {
        // Existing user: SIGN IN with password
        // Supabase signUp() is NEVER called for existing accounts
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
      } else {
        // New user: SIGN UP
        // Authoritative Submit-time check against /api/auth/check-email to prevent race conditions
        let isDuplicate = false;
        try {
          const res = await fetch('/api/auth/check-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: normalizedEmail }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            const result = await res.json();
            if (result.exists) {
              isDuplicate = true;
            }
          }
        } catch (fetchErr) {
          console.warn('Backend duplicate check unavailable, falling back to Auth signUp validation:', fetchErr);
        }

        if (isDuplicate) {
          setIsDuplicateEmail(true);
          setEmailError('Account already exists. Please use a different email.');
          return;
        }

        // Perform Supabase Auth SignUp
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          const errLower = error.message.toLowerCase();
          const errCode = ((error as any).code || '').toLowerCase();
          if (
            errLower.includes('already registered') ||
            errLower.includes('already exists') ||
            errLower.includes('user already exists') ||
            errLower.includes('email address is already in use') ||
            errLower.includes('identity_already_exists') ||
            errCode.includes('already_exists') ||
            errCode === 'user_already_exists' ||
            (error as any).status === 422
          ) {
            setIsDuplicateEmail(true);
            setEmailError('Account already exists. Please use a different email.');
          } else if (errLower.includes('password') && (errLower.includes('short') || errLower.includes('character') || errLower.includes('weak'))) {
            setEmailError('Password must be at least 6 characters');
          } else if (errLower.includes('rate limit') || (error as any).status === 429) {
            setEmailError('Too many signup attempts. Please try again later.');
          } else if (errLower.includes('invalid') && errLower.includes('email')) {
            setEmailError('Please enter a valid email address');
          } else {
            setEmailError('Unable to create account. Please try again later.');
          }
          return;
        }

        // Check for empty identities array (GoTrue duplicate protection)
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setIsDuplicateEmail(true);
          setEmailError('Account already exists. Please use a different email.');
          return;
        }

        // Account created successfully! Supabase Confirm Email is OFF so user is logged in immediately.
        trackEvent('user_signed_up', { method: 'email' });
        if (data.user) {
          identifyUser(data.user.id);
          onLogin({
            id: data.user.id,
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.first_name || data.user.email?.split('@')[0] || 'User',
            email: data.user.email || normalizedEmail,
          });
        }
      }
    } catch (err: any) {
      setEmailError(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, isDuplicateEmail, onLogin, isLoading]);

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
        setForgotEmail={setForgotEmail}
        setForgotError={setForgotError}
        setForgotSuccess={setForgotSuccess}
        isCheckingEmail={isCheckingEmail}
        isDuplicateEmail={isDuplicateEmail}
        onEmailBlur={handleEmailBlur}
        isEntranceAnimating={shouldPlayEntrance && !entranceCompleted}
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

      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 sm:px-8 py-8 lg:py-0 overflow-y-auto lg:overflow-hidden min-h-[100dvh] lg:min-h-0">
        <div className="w-full max-w-[380px] lg:max-w-[440px] flex flex-col items-center my-auto lg:my-0">
          <div className="lg:hidden flex items-center gap-3 mb-[40px] relative">
            {/* The Logo Anchor */}
            <div ref={logoAnchorRef} className="w-[34px] h-[34px] shrink-0 relative flex items-center justify-center">
              {/* Resting static logo (revealed seamlessly once entrance completes) */}
              <div
                className={`shrink-0 transition-opacity duration-200 ${
                  shouldPlayEntrance && !entranceCompleted ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <CodeVibeIcon size={34} variant="dark" className="shrink-0" />
              </div>

              {/* Dedicated Animated C Layer (starts in exact screen center, moves up + scales down) */}
              {shouldPlayEntrance && !entranceCompleted && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
                  <motion.div
                    initial={{
                      scale: 2.75, // ~2.75x moderately large in center
                      x: startCoords.x,
                      y: startCoords.y,
                    }}
                    animate={{
                      scale: 1,
                      x: 0,
                      y: 0,
                    }}
                    transition={{
                      duration: 1.2,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="w-[34px] h-[34px] flex items-center justify-center shrink-0 origin-center"
                  >
                    <CodeVibeIcon size={34} variant="dark" className="shrink-0" />
                  </motion.div>
                </div>
              )}
            </div>

            {/* Wordmark (fades in beside C at ~0.75s) */}
            <motion.span
              initial={shouldPlayEntrance && !entranceCompleted ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.75,
                duration: 0.45,
                ease: [0.25, 1, 0.5, 1],
              }}
              className="font-bold text-[31px] text-[#3A2722] tracking-tight leading-none"
            >
              Cody
            </motion.span>
          </div>

          <div className="w-full relative min-h-0 lg:min-h-[520px] flex flex-col items-center justify-start pt-0 lg:pt-6">
            <AnimatePresence mode="wait">
              {renderRightContent()}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
