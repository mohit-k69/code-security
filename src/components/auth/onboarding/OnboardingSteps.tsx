import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Lock, Mail, User } from 'lucide-react';
import { slideVariants } from './OnboardingComponents';

// --- Types ---
export interface OnboardingEmailStepProps {
  mode: 'signin' | 'signup';
  setMode: (mode: 'signin' | 'signup') => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  firstName: string;
  setFirstName: (val: string) => void;
  lastName: string;
  setLastName: (val: string) => void;
  emailError: string;
  setEmailError: (val: string) => void;
  isLoading: boolean;
  handleEmailContinue: () => void;
  handleGithubSignIn: () => void;
  setShowForgotPassword: (val: boolean) => void;
  setForgotEmail: (val: string) => void;
  setForgotError: (val: string) => void;
  setForgotSuccess: (val: boolean) => void;
  direction: number;
}

export function OnboardingEmailStep({
  mode, setMode, email, setEmail, password, setPassword,
  firstName, setFirstName, lastName, setLastName,
  emailError, setEmailError, isLoading, handleEmailContinue,
  handleGithubSignIn, setShowForgotPassword, setForgotEmail,
  setForgotError, setForgotSuccess, direction
}: OnboardingEmailStepProps) {

  const isSignupReady = mode === 'signup'
    ? email.trim() && password.trim() && firstName.trim() && lastName.trim()
    : email.trim() && password.trim();

  return (
    <motion.div
      key="step-0"
      variants={slideVariants}
      initial={direction > 0 ? 'enterFromRight' : 'enterFromLeft'}
      animate="center"
      exit={direction > 0 ? 'exitToLeft' : 'exitToRight'}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="w-full flex flex-col items-center"
    >
      <div className="relative flex bg-gray-100 p-1 rounded-full mb-8 w-full max-w-[240px]">
        <button
          onClick={() => { setMode('signin'); setEmailError(''); }}
          className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 ${
            mode === 'signin' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => { setMode('signup'); setEmailError(''); }}
          className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 ${
            mode === 'signup' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Sign Up
        </button>
        <motion.div
          className="absolute inset-y-1 bg-white rounded-full shadow-sm"
          initial={false}
          animate={{
            left: mode === 'signin' ? '4px' : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />
      </div>

      <div className="w-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="w-full flex flex-col items-center"
          >
            <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">
              {mode === 'signup' ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-[14px] text-gray-500 mb-8 text-center">
              {mode === 'signup' ? 'Get started with Code Vibe today' : 'Sign in to your account to continue'}
            </p>

            {/* Name fields — only visible on Sign Up */}
            {mode === 'signup' && (
              <div className="w-full flex gap-4 mb-4">
                <div className="flex-1 relative">
                  <User size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setEmailError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                    placeholder="First name"
                    autoFocus
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#3f2a24] pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors"
                  />
                </div>
                <div className="flex-1 relative">
                  <User size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setEmailError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                    placeholder="Last name"
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#3f2a24] pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="w-full mb-4">
              <div className="relative">
                <Mail size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                  placeholder="name@email.com"
                  className={`w-full bg-transparent border-b-2 ${emailError ? 'border-red-400' : 'border-gray-200 focus:border-[#3f2a24]'} pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors`}
                />
              </div>
            </div>

            <div className="w-full mb-2">
              <div className="relative">
                <Lock size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setEmailError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                  placeholder="Password"
                  className={`w-full bg-transparent border-b-2 ${emailError ? 'border-red-400' : 'border-gray-200 focus:border-[#3f2a24]'} pl-6 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors`}
                />
              </div>
              <AnimatePresence>
                {emailError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-red-500 text-[12px] mt-2 text-center"
                  >
                    {emailError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleEmailContinue}
              disabled={!isSignupReady || isLoading}
              className={`w-full text-center py-3 text-[14px] font-medium transition-colors mt-4 mb-6 rounded-full ${
                isSignupReady && !isLoading
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

            <div className="flex items-center gap-4 w-full mb-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[12px] text-gray-400 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button
              onClick={handleGithubSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 rounded-full bg-[#24292e] border border-[#24292e] px-4 py-3 text-[14px] font-semibold text-white hover:bg-[#1b1f23] transition-colors shadow-sm mb-6 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>

            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              By continuing, you agree to our{' '}
              <a href="#" className="text-gray-500 underline hover:text-gray-700">Terms of Service</a>{' '}
              and{' '}
              <a href="#" className="text-gray-500 underline hover:text-gray-700">Privacy Policy</a>.
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
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
  setFirstName: (val: string) => void;
  setLastName: (val: string) => void;
}

export function OnboardingSignupSuccess({
  setSignupSuccess, setMode, setEmail, setPassword, setFirstName, setLastName
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
          setFirstName('');
          setLastName('');
        }}
        className="px-8 py-3 rounded-full bg-[#3f2a24] text-white text-[14px] font-semibold hover:bg-[#2c1d19] transition-colors shadow-lg shadow-[#3f2a24]/20"
      >
        Go to Sign In
      </button>
    </motion.div>
  );
}
