import posthog from 'posthog-js';

let isInitialized = false;

/**
 * Initializes PostHog analytics singleton.
 * If VITE_POSTHOG_KEY is not defined, initialization is gracefully skipped.
 */
export function initPostHog(): void {
  if (isInitialized) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!posthogKey) {
    if (import.meta.env.DEV) {
      console.info('[PostHog] VITE_POSTHOG_KEY is not set. Analytics initialization skipped.');
    }
    return;
  }

  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
  });

  isInitialized = true;
}

export { posthog };
