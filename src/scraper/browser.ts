import { chromium as playwrightChromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';
import { config } from '../config.js';

playwrightChromium.use(stealth());

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

function pickUserAgent(): string {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return ua ?? USER_AGENTS[0]!;
}

export async function launchBrowser(): Promise<Browser> {
  return playwrightChromium.launch({
    headless: config.SCRAPE_HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: pickUserAgent(),
    viewport: { width: 1366, height: 768 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // tsx/esbuild compiles our TS with a `__name(fn, "name")` helper that gets
  // serialized into page.evaluate payloads; the browser context doesn't have
  // __name, so evaluate throws ReferenceError. Polyfill with esbuild's real
  // signature. Passed as a raw string so tsx doesn't inject __name into this
  // script itself.
  await context.addInitScript(
    'window.__name = window.__name || function(t,v){try{Object.defineProperty(t,"name",{value:v,configurable:true});}catch(e){}return t;};'
  );

  return context;
}
