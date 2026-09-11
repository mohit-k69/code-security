import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Lock, Mail, Loader2, ArrowLeft } from 'lucide-react';
import { slideVariants } from './OnboardingComponents';

// --- Types ---
export interface OnboardingEmailStepProps {
  mode: 'signin' | 'signup';
  setMode: (mode: 'signin' | 'signup') => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  emailError: string;
  setEmailError: (val: string) => void;
  isLoading: boolean;
  handleEmailContinue: () => void;
  handleGithubSignIn: () => void;
  handleGoogleSignIn: () => void;
  isGoogleLoading?: boolean;
  setShowForgotPassword: (val: boolean) => void;
  setForgotEmail: (val: string) => void;
  setForgotError: (val: string) => void;
  setForgotSuccess: (val: boolean) => void;
  direction: number;
  isCheckingEmail?: boolean;
  isDuplicateEmail?: boolean;
  onEmailBlur?: () => void;
}

export function OnboardingEmailStep({
  mode, setMode, email, setEmail, password, setPassword,
  emailError, setEmailError, isLoading, handleEmailContinue,
  handleGithubSignIn, handleGoogleSignIn, isGoogleLoading = false,
  setShowForgotPassword, setForgotEmail,
  setForgotError, setForgotSuccess, direction,
  isCheckingEmail = false, isDuplicateEmail = false, onEmailBlur
}: OnboardingEmailStepProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [slideDirection, setSlideDirection] = useState(1);
  const [animationType, setAnimationType] = useState<'mode' | 'form'>('mode');

  const handleModeSwitch = (newMode: 'signin' | 'signup') => {
    if (newMode === mode) return;
    setSlideDirection(newMode === 'signup' ? 1 : -1);
    setAnimationType('mode');
    setMode(newMode);
    setEmailError('');
  };

  const isPasswordError = Boolean(
    emailError &&
    (emailError.toLowerCase().includes('password') || emailError.toLowerCase().includes('credential'))
  );

  const isEmailInvalid = Boolean(
    (emailError && !isPasswordError) || (mode === 'signup' && isDuplicateEmail)
  );

  const isFormReady = Boolean(email.trim() && password.trim());
  const isSubmitDisabled = !isFormReady || isLoading || (mode === 'signup' && (isCheckingEmail || isDuplicateEmail));

  return (
    <div className="w-full flex flex-col items-center">
      {/* ── Slide Button (Segmented Bar) - Completely Stable & Stationary ── */}
      <div
        id="auth-mode-toggle-bar"
        role="tablist"
        aria-label="Sign in or Sign up"
        className="relative flex bg-gray-100 p-1 rounded-full mb-8 w-full max-w-[240px] shrink-0 select-none shadow-xs border border-gray-200/60"
      >
        {/* Sliding Button Pill */}
        <motion.div
          className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm cursor-grab active:cursor-grabbing"
          initial={false}
          animate={{
            left: mode === 'signin' ? '4px' : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
          }}
          transition={{ type: 'spring', stiffness: 450, damping: 35 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.x > 25 && mode === 'signin') {
              handleModeSwitch('signup');
            } else if (info.offset.x < -25 && mode === 'signup') {
              handleModeSwitch('signin');
            }
          }}
        />

        <button
          type="button"
          role="tab"
          id="toggle-signin-btn"
          aria-selected={mode === 'signin'}
          onClick={() => handleModeSwitch('signin')}
          className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 cursor-pointer text-center ${
            mode === 'signin' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          id="toggle-signup-btn"
          aria-selected={mode === 'signup'}
          onClick={() => handleModeSwitch('signup')}
          className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 cursor-pointer text-center ${
            mode === 'signup' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Sign Up
        </button>
      </div>

      {/* ── Content & Buttons Below - Only This Moves ── */}
      <div className="w-full relative overflow-hidden min-h-[380px]">
        <AnimatePresence custom={slideDirection} initial={false} mode="popLayout">
          {!showEmailForm ? (
            <motion.div
              key={`options-${mode}`}
              custom={slideDirection}
              variants={{
                enter: (dir: number) => ({
                  x: animationType === 'mode' ? (dir > 0 ? 140 : -140) : 0,
                  y: animationType === 'form' ? -12 : 0,
                  opacity: 0,
                }),
                center: {
                  x: 0,
                  y: 0,
                  opacity: 1,
                },
                exit: (dir: number) => ({
                  x: animationType === 'mode' ? (dir > 0 ? -140 : 140) : 0,
                  y: animationType === 'form' ? 12 : 0,
                  opacity: 0,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 380, damping: 34 },
                opacity: { duration: 0.18 },
              }}
              className="w-full flex flex-col items-center"
            >
              <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">
                {mode === 'signup' ? 'Create an account' : 'Welcome back'}
              </h2>
              <p className="text-[14px] text-gray-500 mb-6 text-center">
                {mode === 'signup' ? 'Get started with Cody today' : 'Sign in to your account to continue'}
              </p>

              <AnimatePresence>
                {emailError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="w-full px-3.5 py-2.5 mb-5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium text-center"
                  >
                    {emailError}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Three options: vertically stacked and back-to-back */}
              <div className="w-full flex flex-col gap-2.5">
                {/* 1. Continue with Google */}
                <button
                  id="google-signin-btn"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span>Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>

                {/* 2. Continue with GitHub */}
                <button
                  id="github-signin-btn"
                  onClick={handleGithubSignIn}
                  disabled={isLoading || isGoogleLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-full bg-[#24292e] border border-[#24292e] px-4 py-3 text-[14px] font-semibold text-white hover:bg-[#1b1f23] transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>Continue with GitHub</span>
                </button>

                {/* 3. Continue with email */}
                <button
                  id="email-signin-btn"
                  type="button"
                  onClick={() => {
                    setAnimationType('form');
                    setSlideDirection(1);
                    setShowEmailForm(true);
                    setEmailError('');
                  }}
                  disabled={isLoading || isGoogleLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span>Continue with email</span>
                </button>
              </div>

              <p className="text-[11px] text-gray-400 text-center leading-relaxed mt-6">
                By continuing, you agree to our{' '}
                <a href="#" className="text-gray-500 underline hover:text-gray-700">Terms of Service</a>{' '}
                and{' '}
                <a href="#" className="text-gray-500 underline hover:text-gray-700">Privacy Policy</a>.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={`form-${mode}`}
              custom={slideDirection}
              variants={{
                enter: (dir: number) => ({
                  x: animationType === 'mode' ? (dir > 0 ? 140 : -140) : 0,
                  y: animationType === 'form' ? 12 : 0,
                  opacity: 0,
                }),
                center: {
                  x: 0,
                  y: 0,
                  opacity: 1,
                },
                exit: (dir: number) => ({
                  x: animationType === 'mode' ? (dir > 0 ? -140 : 140) : 0,
                  y: animationType === 'form' ? -12 : 0,
                  opacity: 0,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 380, damping: 34 },
                opacity: { duration: 0.18 },
              }}
              className="w-full flex flex-col items-center"
            >
              {/* Back to authentication options button */}
              <button
                type="button"
                id="back-to-auth-options-btn"
                onClick={() => {
                  setAnimationType('form');
                  setSlideDirection(-1);
                  setShowEmailForm(false);
                  setEmailError('');
                }}
                className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 mb-4 transition-colors cursor-pointer self-start"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">
                {mode === 'signup' ? 'Create an account' : 'Welcome back'}
              </h2>
              <p className="text-[14px] text-gray-500 mb-6 text-center">
                {mode === 'signup' ? 'Get started with Cody today' : 'Sign in to your account to continue'}
              </p>

              <AnimatePresence>
                {emailError && emailError !== 'Account already exists. Please use a different email.' && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="w-full px-3.5 py-2.5 mb-5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium text-center"
                  >
                    {emailError}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="w-full mb-4">
                <div className="relative">
                  <Mail size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="onboarding-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError && !isPasswordError) {
                        setEmailError('');
                      }
                    }}
                    onBlur={onEmailBlur}
                    onKeyDown={(e) => e.key === 'Enter' && !isSubmitDisabled && handleEmailContinue()}
                    placeholder="name@email.com"
                    autoFocus
                    className={`w-full bg-transparent border-b-2 ${isEmailInvalid ? 'border-red-400' : 'border-gray-200 focus:border-[#3f2a24]'} pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors`}
                  />
                </div>
                {mode === 'signup' && isCheckingEmail && (
                  <div id="email-checking-indicator" className="flex items-center gap-1.5 mt-2 text-[12px] text-gray-500">
                    <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />
                    <span>Checking email…</span>
                  </div>
                )}
                {mode === 'signup' && (isDuplicateEmail || emailError === 'Account already exists. Please use a different email.') && !isCheckingEmail && (
                  <div id="email-duplicate-inline-warning" className="flex items-center gap-1.5 mt-2 text-[12px] text-red-500 font-medium">
                    <span>Account already exists. Please use a different email.</span>
                  </div>
                )}
              </div>

              <div className="w-full mb-2">
                <div className="relative">
                  <Lock size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="onboarding-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (isPasswordError) {
                        setEmailError('');
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !isSubmitDisabled && handleEmailContinue()}
                    placeholder="Password"
                    className={`w-full bg-transparent border-b-2 ${isPasswordError ? 'border-red-400' : 'border-gray-200 focus:border-[#3f2a24]'} pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors`}
                  />
                </div>
              </div>

              <button
                id="email-submit-btn"
                onClick={handleEmailContinue}
                disabled={isSubmitDisabled}
                className={`w-full text-center py-3 text-[14px] font-medium transition-colors mt-4 mb-6 rounded-full ${
                  !isSubmitDisabled
                    ? 'bg-[#3f2a24] text-white hover:bg-[#5b443c] cursor-pointer'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {isLoading
                  ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
                  : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>

              {mode === 'signin' && (
                <button
                  id="forgot-password-link"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setForgotEmail(email);
                    setForgotError('');
                    setForgotSuccess(false);
                    setEmailError('');
                  }}
                  className="text-[13px] font-medium text-gray-500 hover:text-[#3f2a24] transition-colors mb-4 self-center"
                >
                  Forgot password?
                </button>
              )}

              <p className="text-[11px] text-gray-400 text-center leading-relaxed mt-2">
                By continuing, you agree to our{' '}
                <a href="#" className="text-gray-500 underline hover:text-gray-700">Terms of Service</a>{' '}
                and{' '}
                <a href="#" className="text-gray-500 underline hover:text-gray-700">Privacy Policy</a>.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Forgot Password ---
export interface OnboardingForgotPasswordProps {
  forgotSuccess: boolean;
  forgotEmail: string;
  setForgotEmail: (val: string) => void;
  forgotError: string;
  setForgotError: (val: string) => void;
  forgotLoading: boolean;
  handleForgotPassword: () => void;
  setShowForgotPassword: (val: boolean) => void;
  setForgotSuccess: (val: boolean) => void;
}

export function OnboardingForgotPassword({
  forgotSuccess, forgotEmail, setForgotEmail, forgotError,
  setForgotError, forgotLoading, handleForgotPassword,
  setShowForgotPassword, setForgotSuccess
}: OnboardingForgotPasswordProps) {
  if (forgotSuccess) {
    return (
      <motion.div
        key="forgot-success"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full flex flex-col items-center text-center px-4"
      >
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-[24px] font-semibold text-gray-900 mb-3">Check your email</h2>
        <p className="text-[15px] text-gray-500 leading-relaxed mb-8 max-w-[340px]">
          If an account exists for this email, we've sent password reset instructions.
        </p>
        <button
          onClick={() => {
            setShowForgotPassword(false);
            setForgotSuccess(false);
            setForgotEmail('');
            setForgotError('');
          }}
          className="px-8 py-3 rounded-full bg-[#3f2a24] text-white text-[14px] font-semibold hover:bg-[#2c1d19] transition-colors shadow-lg shadow-[#3f2a24]/20"
        >
          Back to Sign In
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="forgot-form"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeInOut' }}
      className="w-full flex flex-col items-center"
    >
      <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">Reset your password</h2>
      <p className="text-[14px] text-gray-500 mb-8 text-center">Enter your email and we'll send you a reset link</p>

      <div className="w-full mb-4">
        <div className="relative">
          <Mail size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={forgotEmail}
            onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
            placeholder="name@email.com"
            className={`w-full bg-transparent border-b-2 ${forgotError ? 'border-red-400' : 'border-gray-200 focus:border-[#3f2a24]'} pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors`}
          />
        </div>
        <AnimatePresence>
          {forgotError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-red-500 text-[12px] mt-2 text-center"
            >
              {forgotError}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={handleForgotPassword}
        disabled={!forgotEmail.trim() || forgotLoading}
        className={`w-full text-center py-3 text-[14px] font-medium transition-colors mt-4 mb-6 rounded-full ${
          forgotEmail.trim() && !forgotLoading
            ? 'bg-[#3f2a24] text-white hover:bg-[#5b443c] cursor-pointer'
            : 'bg-gray-100 text-gray-300 cursor-not-allowed'
        }`}
      >
        {forgotLoading ? 'Sending...' : 'Send Reset Link'}
      </button>

      <button
        onClick={() => {
          setShowForgotPassword(false);
          setForgotEmail('');
          setForgotError('');
        }}
        className="text-[13px] font-medium text-gray-500 hover:text-gray-800 transition-colors"
      >
        ← Back to Sign In
      </button>
    </motion.div>
  );
}

// --- Signup Success ---
export interface OnboardingSignupSuccessProps {
  setSignupSuccess: (val: boolean) => void;
  setMode: (mode: 'signin' | 'signup') => void;
  setEmail: (val: string) => void;
  setPassword: (val: string) => void;
}

export function OnboardingSignupSuccess({
  setSignupSuccess, setMode, setEmail, setPassword
}: OnboardingSignupSuccessProps) {
  return (
    <motion.div
      key="signup-success"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="w-full flex flex-col items-center text-center px-4"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <h2 className="text-[24px] font-semibold text-gray-900 mb-3">Account created successfully!</h2>
      <p className="text-[15px] text-gray-500 leading-relaxed mb-8 max-w-[340px]">
        Please check your email to verify your account before signing in.
      </p>
      <button
        onClick={() => {
          setSignupSuccess(false);
          setMode('signin');
          setEmail('');
          setPassword('');
        }}
        className="px-8 py-3 rounded-full bg-[#3f2a24] text-white text-[14px] font-semibold hover:bg-[#2c1d19] transition-colors shadow-lg shadow-[#3f2a24]/20"
      >
        Go to Sign In
      </button>
    </motion.div>
  );
}
