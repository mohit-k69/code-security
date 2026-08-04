import { useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { isValidEmailFormat, isValidEmailDomain } from './components/auth/onboarding/emailUtils';
import { OnboardingImage } from './components/auth/onboarding/OnboardingComponents';

import {
  OnboardingEmailStep,
  OnboardingNameStep,
  OnboardingTourStep,
  OnboardingForgotPassword,
  OnboardingSignupSuccess
} from './components/auth/onboarding/OnboardingSteps';

// ─── Onboarding Images ──────────────────────────────────────────
import archwayImg from '../assets/onboard-archway.png';
import untangleImg from '../assets/onboard-untangle.png';
import elevateImg from '../assets/onboard-elevate.png';
import domeImg from '../assets/onboard-dome.png';

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
  const [signupSuccess, setSignupSuccess] = useState(false);
  
  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const TOUR_PAGE_COUNT = 4;

  const goForward = useCallback(() => {
    setDirection(1);
    setStep(prev => prev + 1);
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep(prev => Math.max(0, prev - 1));
  }, []);

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

  const handleNameContinue = useCallback(() => {
    if (!firstName.trim() || !lastName.trim()) return;
    goForward();
  }, [firstName, lastName, goForward]);

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

      setSignupSuccess(true);
    } catch (err: any) {
      setEmailError(err.message || 'An unexpected signup error occurred.');
      setStep(0);
    } finally {
      setIsLoading(false);
    }
  }, [firstName, lastName, email, password]);

  const handleGithubSignIn = async () => {
    try {
      setIsLoading(true);
      setEmailError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
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
          setStep={setStep}
          setEmail={setEmail}
          setPassword={setPassword}
          setFirstName={setFirstName}
          setLastName={setLastName}
        />
      );
    }

    if (step === 0) {
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
          setShowForgotPassword={setShowForgotPassword}
          setForgotEmail={setForgotEmail}
          setForgotError={setForgotError}
          setForgotSuccess={setForgotSuccess}
          direction={direction}
        />
      );
    }

    if (step === 1) {
      return (
        <OnboardingNameStep
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          handleNameContinue={handleNameContinue}
          goBack={goBack}
          direction={direction}
          TOUR_PAGE_COUNT={TOUR_PAGE_COUNT}
        />
      );
    }

    const pageIndex = step - 2;
    const page = onboardingPages[pageIndex];
    const isLastPage = pageIndex === onboardingPages.length - 1;

    return (
      <OnboardingTourStep
        step={step}
        direction={direction}
        pageIndex={pageIndex}
        page={page}
        isLastPage={isLastPage}
        isLoading={isLoading}
        handleFinish={handleFinish}
        goForward={goForward}
        goBack={goBack}
        TOUR_PAGE_COUNT={TOUR_PAGE_COUNT}
      />
    );
  };

  return (
    <div className="flex h-screen w-full font-sans antialiased">
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
