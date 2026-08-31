import posthog from 'posthog-js';

let isInitialized = false;
let lastTrackedPath = '';

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
    persistence: 'localStorage+cookie',
  });

  isInitialized = true;
}

/**
 * Identify a logged-in user by their unique ID without sending sensitive PII.
 */
export function identifyUser(userId: string): void {
  if (!userId) return;
  try {
    posthog.identify(userId);
  } catch (err) {
    console.warn('[PostHog] Failed to identify user:', err);
  }
}

/**
 * Reset user identity and session on logout.
 */
export function resetUser(): void {
  try {
    posthog.reset();
  } catch (err) {
    console.warn('[PostHog] Failed to reset user session:', err);
  }
}

/**
 * Explicitly track page views for SPA route/tab transitions while avoiding duplicate triggers.
 */
export function trackPageView(path: string, title?: string): void {
  if (path === lastTrackedPath) {
    return;
  }
  lastTrackedPath = path;

  try {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      path,
      title: title || document.title,
    });
  } catch (err) {
    console.warn('[PostHog] Failed to capture pageview:', err);
  }
}

/**
 * Safely capture a custom event with privacy-safe properties.
 */
export function trackEvent(eventName: string, properties?: Record<string, string | number | boolean | null | undefined>): void {
  try {
    posthog.capture(eventName, properties);
  } catch (err) {
    console.warn(`[PostHog] Failed to capture event "${eventName}":`, err);
  }
}

export { posthog };
