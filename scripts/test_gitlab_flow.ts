import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const url = 'https://riqjsppvihvcyihuhkzg.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcWpzcHB2aWh2Y3lpaHVoa3pnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTU3NTE2NCwiZXhwIjoyMTAxMTUxMTY0fQ.2pPPddQ5txQa6097V7u1PD-zGvF3s7uHsoQtcXv1PrE';
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log("Generating fresh magic link...");
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mohit.k.main@gmail.com',
  });
  if (error) throw error;
  const MAGIC_LINK = data.properties.action_link + "&redirect_to=https://code-security-review.vercel.app/sync-code";
  
  console.log("Starting Playwright forensic trace...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.addInitScript(() => {
    window['authEvents'] = [];
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      if (url && url.includes('functions/v1/store-provider-token')) {
        console.log("FETCH_INTERCEPT: store-provider-token invoked");
        const res = await originalFetch.apply(this, args);
        const clone = res.clone();
        clone.text().then(text => {
           console.log(`STORE_TOKEN_RESULT: HTTP ${res.status}, body length: ${text.length}`);
           if (text.toLowerCase().includes('error')) {
              console.log("STORE_TOKEN_RESULT: error - " + text.substring(0, 100));
           } else {
              console.log("STORE_TOKEN_RESULT: success");
           }
        }).catch(() => {});
        return res;
      }
      return originalFetch.apply(this, args);
    };
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('auth/v1/user/identities') || url.includes('auth/v1/authorize')) {
       try {
         const json = await response.json();
         console.log(`\nSUPABASE_LINK_RESPONSE [${response.status()}]:`);
         if (json.url) console.log("data.url exists: yes");
         else console.log("data.url exists: no");
         
         if (json.error) {
           console.log("error exists: yes");
           console.log("error message: " + (json.error_description || json.error));
         } else {
           console.log("error exists: no");
         }
       } catch (e) {
         // Some endpoints don't return JSON
       }
    }
  });

  console.log("Navigating to magic link...");
  await page.goto(MAGIC_LINK);
  
  console.log("Redirected to app. Waiting for network idle...");
  await page.waitForLoadState('networkidle');

  console.log("\n--- STAGE 1: BEFORE LINK ---");
  const sessionData = await page.evaluate(() => {
    const key = 'sb-riqjsppvihvcyihuhkzg-auth-token';
    const val = window.localStorage.getItem(key);
    if (!val) return null;
    return JSON.parse(val);
  });

  if (sessionData && sessionData.user) {
    console.log("Session exists: yes");
    console.log("User ID: " + sessionData.user.id);
    console.log("Access token exists: " + !!sessionData.access_token);
    console.log("Session expiry: " + sessionData.expires_at);
  } else {
    console.log("Session exists: no");
  }
  console.log("Current URL: " + page.url());

  // Wait for the UI to render the providers
  await page.waitForTimeout(2000); 

  console.log("\nClicking GitLab Connect button...");
  // Look for the exact "Connect" button in the GitLab card.
  // The app uses a generic Provider card with an h3 that has the provider name, and a button that says "Connect".
  const gitlabBtn = page.locator('div').filter({ hasText: /^GitLab$/ }).locator('..').locator('button', { hasText: 'Connect' });
  const count = await gitlabBtn.count();
  
  if (count > 0) {
     await gitlabBtn.first().click();
     console.log("Clicked GitLab Connect.");
  } else {
     // Alternative selector
     const altBtn = page.locator('text=Connect GitLab');
     if (await altBtn.count() > 0) {
         await altBtn.first().click();
         console.log("Clicked Connect GitLab.");
     } else {
         console.log("Could not find GitLab Connect button.");
         console.log(await page.evaluate(() => document.body.innerText));
         await browser.close();
         process.exit(1);
     }
  }

  console.log("\nWaiting for navigation after click...");
  try {
     await page.waitForNavigation({ timeout: 10000 });
  } catch (e) {
     console.log("Navigation timeout. Current URL: " + page.url());
  }
  
  console.log("\n--- STAGE 3: AFTER REDIRECT ---");
  console.log("Current URL: " + page.url());
  
  if (page.url().includes('gitlab.com')) {
      console.log("Browser is at GitLab authorization page.");
      // We know it reached GitLab!
  } else {
      console.log("Browser did not go to GitLab. Did it fail locally?");
  }

  console.log("\n--- CONSOLE LOGS ---");
  // Filter out noisy logs
  logs.filter(l => l.includes('FETCH_INTERCEPT') || l.includes('AUTH_EVENT') || l.includes('STORE_TOKEN_RESULT') || l.includes('SUPABASE')).forEach(l => console.log(l));

  await browser.close();
}

run().catch(e => {
  console.error("Script failed:", e);
  process.exit(1);
});
