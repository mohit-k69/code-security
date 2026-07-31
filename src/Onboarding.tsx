import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingProps {
  onLogin: (user: { name: string; email: string; avatar?: string }) => void;
}

export default function Onboarding({ onLogin }: OnboardingProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailContinue = () => {
    if (!email.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      onLogin({ name: email.split('@')[0], email });
      setIsLoading(false);
    }, 600);
  };

  const handleGoogleSignIn = () => {
    // Google Identity Services integration
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
      // Demo fallback when no client ID is configured
      setIsLoading(true);
      setTimeout(() => {
        onLogin({ name: 'Mohit', email: 'mohit@gmail.com' });
        setIsLoading(false);
      }, 600);
      return;
    }

    // Load and initialize Google Sign-In
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      (window as any).google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          const payload = JSON.parse(atob(response.credential.split('.')[1]));
          onLogin({
            name: payload.name || payload.email.split('@')[0],
            email: payload.email,
            avatar: payload.picture,
          });
        },
      });
      (window as any).google.accounts.id.prompt();
    };
    document.head.appendChild(script);
  };

  return (
    <div className="flex h-screen w-full font-sans antialiased">
      {/* Left side — Branding */}
      <div className="hidden lg:flex w-[580px] bg-[#3f2a24] flex-col justify-between p-16 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L5 30l25 25 25-25z' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
        }} />

        {/* Logo */}
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

        {/* Tagline */}
        <div className="relative z-10">
          <h1 className="text-white text-[36px] font-bold leading-tight mb-4">
            Check the vibe<br />of your code.
          </h1>
          <p className="text-[#b8a298] text-[16px] leading-relaxed max-w-[340px]">
            Analyze your code for security issues, best practices, and quality — all in seconds.
          </p>
        </div>

        {/* Bottom decoration */}
        <div className="relative z-10 text-[#8b6f61] text-[13px]">
          © 2026 Code Vibe
        </div>
      </div>

      {/* Right side — Auth form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6">
        <div className="w-full max-w-[380px] flex flex-col items-center">
          {/* Mobile logo (hidden on desktop) */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#3f2a24]">
              <path d="M7 10L3 14L7 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 10L25 14L21 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="13" cy="13" r="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M16 16L19 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-xl text-[#3f2a24] tracking-wide">Code Vibe</span>
          </div>

          {/* Mode Switcher Tabs - STILL & FIXED */}
          <div className="relative flex bg-gray-100 p-1 rounded-full mb-8 w-full max-w-[240px]">
            <button
              onClick={() => setMode('signup')}
              className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 ${
                mode === 'signup' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setMode('signin')}
              className={`relative flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors z-10 ${
                mode === 'signin' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Sign In
            </button>
            {/* Sliding white pill background */}
            <motion.div
              className="absolute inset-y-1 bg-white rounded-full shadow-sm"
              initial={false}
              animate={{
                left: mode === 'signup' ? '4px' : 'calc(50% + 2px)',
                width: 'calc(50% - 6px)',
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          </div>

          {/* Form Content Area (Only content inside changes) */}
          <div className="w-full relative min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
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
                <div className="w-full mb-6">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailContinue()}
                    placeholder="name@email.com"
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#3f2a24] px-1 pb-3 pt-1 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none transition-colors"
                  />
                </div>

                {/* Continue Button */}
                <button
                  onClick={handleEmailContinue}
                  disabled={!email.trim() || isLoading}
                  className={`w-full text-center py-3 text-[14px] font-medium transition-colors mb-6 ${
                    email.trim() && !isLoading
                      ? 'text-[#3f2a24] hover:text-[#5b443c] cursor-pointer'
                      : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (mode === 'signup' ? 'Creating account...' : 'Signing in...') : 'Continue with Email'}
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
                  className="w-full flex items-center justify-center gap-3 rounded-full bg-white border border-gray-200 px-4 py-3 text-[14px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors shadow-sm mb-6"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                    <path fill="#FBBC05" d="M5.525 18.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V10.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  Continue with Google
                </button>

                {/* Mode toggle link */}
                <p className="text-[13px] text-gray-500 mb-6">
                  {mode === 'signup' ? (
                    <>
                      Already have an account?{' '}
                      <button onClick={() => setMode('signin')} className="text-[#3f2a24] font-semibold hover:underline">
                        Sign In
                      </button>
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <button onClick={() => setMode('signup')} className="text-[#3f2a24] font-semibold hover:underline">
                        Sign Up
                      </button>
                    </>
                  )}
                </p>

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
        </div>
      </div>
    </div>
  );
}
