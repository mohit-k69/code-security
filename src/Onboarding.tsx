import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Lock, Mail, User } from 'lucide-react';
import { supabase } from './lib/supabase';

// ─── Onboarding Images (abstract 3D renders) ──────────────────────
import archwayImg from '../assets/onboard-archway.png';
import untangleImg from '../assets/onboard-untangle.png';
import elevateImg from '../assets/onboard-elevate.png';
import domeImg from '../assets/onboard-dome.png';

// ─── Email Validation ──────────────────────────────────────────────

const VALID_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com',
  'zoho.com', 'zohomail.com',
  'mail.com',
  'yandex.com', 'yandex.ru',
  'fastmail.com',
  'tutanota.com', 'tuta.io',
  'gmx.com', 'gmx.net',
  'hey.com',
  'pm.me',
  'rediffmail.com',
]);

const VALID_TLDS = ['.edu', '.gov', '.org', '.co', '.ac', '.mil'];

function isValidEmailDomain(email: string): boolean {
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  if (VALID_DOMAINS.has(domain)) return true;
  return VALID_TLDS.some(tld => domain.endsWith(tld));
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Onboarding Image Component ───────────────────────────────────
// Clean, abstract 3D renders — metaphorical, not literal.
// Each image represents the FEELING of its page.

function OnboardingImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full flex justify-center items-center h-[260px] relative">
      <img
        src={src}
        alt={alt}
        className="h-[250px] w-auto object-contain select-none pointer-events-none [mask-image:radial-gradient(ellipse_at_center,_black_50%,_transparent_90%)]"
        draggable={false}
      />
    </div>
  );
}

// ─── Step Dot Indicator ────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === current ? 24 : 6,
            height: 6,
            backgroundColor: i === current ? '#3f2a24' : i < current ? '#c17f59' : '#e8ddd7',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      ))}
    </div>
  );
}

// ─── Slide Direction Helper ────────────────────────────────────────

const slideVariants = {
  enterFromRight: { x: 80, opacity: 0 },
  enterFromLeft: { x: -80, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitToLeft: { x: -80, opacity: 0 },
  exitToRight: { x: 80, opacity: 0 },
};

// ─── Main Onboarding Component ─────────────────────────────────────

interface OnboardingProps {
  onLogin: (user: { name: string; email: string; avatar?: string }) => void;
}

export default function Onboarding({ onLogin }: OnboardingProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const TOUR_PAGE_COUNT = 4;

  // ─── Navigation ────────────────────────────────────

  const goForward = useCallback(() => {
    setDirection(1);
    setStep(prev => prev + 1);
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep(prev => Math.max(0, prev - 1));
  }, []);

  // ─── Email Continue / Sign In ──────────────────────

  const handleEmailContinue = useCallback(async () => {
    if (!email.trim()) return;

    if (!isValidEmailFormat(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (!isValidEmailDomain(email)) {
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

    if (mode === 'signin') {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
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
          onLogin({
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.first_name || data.user.email?.split('@')[0] || 'User',
            email: data.user.email || email,
          });
        }
      } catch (err: any) {
        setEmailError(err.message || 'An unexpected authentication error occurred.');
      } finally {
        setIsLoading(false);
      }
    } else {
      goForward();
    }
  }, [email, password, mode, onLogin, goForward]);

  // ─── Name Continue (Step 1 → 2) ───────────────────

  const handleNameContinue = useCallback(() => {
    if (!firstName.trim() || !lastName.trim()) return;
    goForward();
  }, [firstName, lastName, goForward]);

  // ─── Finish → Supabase Sign Up ────────────────────

  const handleFinish = useCallback(async () => {
    setIsLoading(true);
    setEmailError('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`,
          },
        },
      });

      if (error) {
        let friendlyError = error.message;
        if (error.message.toLowerCase().includes('already registered')) {
          friendlyError = 'An account with this email already exists. Try signing in instead.';
        }
        setEmailError(friendlyError);
        setStep(0);
        return;
      }

      const user = data.user;
      onLogin({
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: user?.email || email,
      });
    } catch (err: any) {
      setEmailError(err.message || 'An unexpected signup error occurred.');
      setStep(0);
    } finally {
      setIsLoading(false);
    }
  }, [firstName, lastName, email, password, onLogin]);

  // ─── Google Sign In ───────────────────────────────

  const handleGoogleSignIn = async () => {
    setEmailError('Google sign in is coming soon! Please use email for now.');
  };

  // ─── Onboarding Tour Data ─────────────────────────
  // Speaks directly to vibe coders — empathetic, warm,
  // addresses fears and insecurities, not feature lists.

  const onboardingPages = [
    {
      illustration: <OnboardingImage src={archwayImg} alt="An open archway leading to warm sunlight — stepping forward with confidence" />,
      title: 'Scared to hit deploy?',
      subtitle: 'You\'re not alone — and we\'ve got your back.',
      description: 'You built something real. That takes guts. Now let us check it over so you can ship with confidence, not anxiety.',
    },
    {
      illustration: <OnboardingImage src={untangleImg} alt="Tangled threads smoothly becoming a clean flowing ribbon — from confusion to clarity" />,
      title: 'No scary error messages.',
      subtitle: 'We speak your language, not compiler.',
      description: 'Every issue we find comes with a plain-English explanation of what went wrong and exactly how to fix it. No Googling required.',
    },
    {
      illustration: <OnboardingImage src={elevateImg} alt="A small sphere elevated to match a larger one — leveling the playing field" />,
      title: 'You don\'t need 10 years of experience.',
      subtitle: 'Code Vibe checks what senior devs check.',
      description: 'Security holes, bad patterns, performance traps — we catch the stuff that takes years of experience to spot. You just paste and go.',
    },
    {
      illustration: <OnboardingImage src={domeImg} alt="A glass dome protecting a glowing orb — your code kept safe and private" />,
      title: 'Your code stays between us.',
      subtitle: 'Everything runs in your browser. Seriously.',
      description: 'No servers, no uploads, no tracking. Whether it\'s a client project or a late-night side hustle — your code never leaves your machine.',
    },
  ];

  // ─── Render Right Panel Content ───────────────────

  const renderRightContent = () => {
    // Step 0: Email entry
    if (step === 0) {
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
          {/* Mode Switcher Tabs — FIXED (does not slide with content) */}
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

          {/* Form Content Area — Only content inside animates when switching tabs */}
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
                {/* Title & Subtitle */}
                <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">
                  {mode === 'signup' ? 'Create an account' : 'Welcome back'}
                </h2>
                <p className="text-[14px] text-gray-500 mb-8 text-center">
                  {mode === 'signup' ? 'Get started with Code Vibe today' : 'Sign in to your account to continue'}
                </p>

                {/* Email field */}
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

                {/* Password field */}
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

                {/* Continue Button */}
                <button
                  onClick={handleEmailContinue}
                  disabled={!email.trim() || !password.trim() || isLoading}
                  className={`w-full text-center py-3 text-[14px] font-medium transition-colors mt-4 mb-6 rounded-full ${
                    email.trim() && password.trim() && !isLoading
                      ? 'bg-[#3f2a24] text-white hover:bg-[#5b443c] cursor-pointer'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {isLoading
                    ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
                    : mode === 'signup' ? 'Continue' : 'Sign In'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4 w-full mb-6">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[12px] text-gray-400 font-medium">OR</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Google Sign In */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-gray-200 px-4 py-3 text-[14px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors shadow-sm mb-6 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                    <path fill="#FBBC05" d="M5.525 18.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V10.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  Continue with Google
                </button>


                {/* Terms */}
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

    // Step 1: Name entry
    if (step === 1) {
      return (
        <motion.div
          key="step-1"
          variants={slideVariants}
          initial={direction > 0 ? 'enterFromRight' : 'enterFromLeft'}
          animate="center"
          exit={direction > 0 ? 'exitToLeft' : 'exitToRight'}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="w-full flex flex-col items-center"
        >
          <button
            onClick={goBack}
            className="self-start flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-[#3f2a24] transition-colors mb-8 cursor-pointer group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          <div className="w-16 h-16 rounded-full bg-[#f5ebe6] flex items-center justify-center mb-6">
            <User size={24} className="text-[#3f2a24] opacity-50" />
          </div>

          <h2 className="text-[24px] font-semibold text-gray-900 mb-2 text-center">
            What's your name?
          </h2>
          <p className="text-[14px] text-gray-500 mb-8 text-center">
            Let us know how to greet you
          </p>

          <div className="w-full mb-6">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lastName.trim() && handleNameContinue()}
              placeholder="John"
              autoFocus
              className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#3f2a24] px-1 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-300 outline-none transition-colors"
            />
          </div>

          <div className="w-full mb-8">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 block">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && firstName.trim() && handleNameContinue()}
              placeholder="Doe"
              className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#3f2a24] px-1 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-300 outline-none transition-colors"
            />
          </div>

          <button
            onClick={handleNameContinue}
            disabled={!firstName.trim() || !lastName.trim()}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-medium transition-all ${
              firstName.trim() && lastName.trim()
                ? 'bg-[#3f2a24] text-white hover:bg-[#5b443c] cursor-pointer'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            Next
            <ArrowRight size={16} />
          </button>

          <div className="mt-8">
            <StepDots current={0} total={TOUR_PAGE_COUNT + 1} />
          </div>
        </motion.div>
      );
    }

    // Steps 2–5: Onboarding tour pages
    const pageIndex = step - 2;
    const page = onboardingPages[pageIndex];
    const isLastPage = pageIndex === onboardingPages.length - 1;

    return (
      <motion.div
        key={`step-${step}`}
        variants={slideVariants}
        initial={direction > 0 ? 'enterFromRight' : 'enterFromLeft'}
        animate="center"
        exit={direction > 0 ? 'exitToLeft' : 'exitToRight'}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="w-full flex flex-col items-center"
      >
        {/* Back button */}
        <button
          onClick={goBack}
          className="self-start flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-[#3f2a24] transition-colors mb-3 cursor-pointer group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>

        {/* Illustration — clean, centered */}
        <div className="w-full mb-2">
          {page.illustration}
        </div>

        {/* Title — big, empathetic */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className="text-[21px] font-bold text-gray-900 mb-1.5 text-center leading-tight"
        >
          {page.title}
        </motion.h2>

        {/* Subtitle — warm, reassuring */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-[13px] font-semibold text-[#3f2a24]/60 mb-3 text-center"
        >
          {page.subtitle}
        </motion.p>

        {/* Description — conversational tone */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          className="text-[13px] text-gray-500 text-center leading-relaxed max-w-[340px] mb-7"
        >
          {page.description}
        </motion.p>

        {/* Action Button */}
        <button
          onClick={isLastPage ? handleFinish : goForward}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-[#3f2a24] text-white text-[14px] font-medium hover:bg-[#5b443c] transition-colors cursor-pointer"
        >
          {isLoading ? (
            'Setting up your workspace...'
          ) : isLastPage ? (
            <>
              Let's Go
              <Check size={16} />
            </>
          ) : (
            <>
              Next
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Skip */}
        {!isLastPage && (
          <button
            onClick={handleFinish}
            className="mt-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            Skip for now
          </button>
        )}

        {/* Step dots */}
        <div className="mt-5">
          <StepDots current={pageIndex + 1} total={TOUR_PAGE_COUNT + 1} />
        </div>
      </motion.div>
    );
  };

  // ─── Layout ───────────────────────────────────────

  return (
    <div className="flex h-screen w-full font-sans antialiased">
      {/* Left side — Branding (STATIC) */}
      <div className="hidden lg:flex w-[580px] bg-[#3f2a24] flex-col justify-between p-16 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L5 30l25 25 25-25z' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
              <path d="M7 10L3 14L7 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 10L25 14L21 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="13" cy="13" r="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M16 16L19 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-2xl text-white tracking-wide">Code Vibe</span>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-white text-[36px] font-bold leading-tight mb-4">
            Check the vibe<br />of your code.
          </h1>
          <p className="text-[#b8a298] text-[16px] leading-relaxed max-w-[340px]">
            Analyze your code for security issues, best practices, and quality — all in seconds.
          </p>
        </div>

        <div className="relative z-10 text-[#8b6f61] text-[13px]">
          © 2026 Code Vibe
        </div>
      </div>

      {/* Right side — Multi-step flow */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 overflow-hidden">
        <div className="w-full max-w-[440px] flex flex-col items-center">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#3f2a24]">
              <path d="M7 10L3 14L7 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 10L25 14L21 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="13" cy="13" r="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M16 16L19 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-xl text-[#3f2a24] tracking-wide">Code Vibe</span>
          </div>

          <div className="w-full relative min-h-[520px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {renderRightContent()}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
