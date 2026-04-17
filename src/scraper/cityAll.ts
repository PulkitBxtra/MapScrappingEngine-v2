import type { BrowserContext, Response } from 'playwright';
import { logger } from '../logger.js';
import { extractHotelsFromState, parseHotelRaw, type ListingHotel } from './listing.js';

export interface FullCityResult {
  total: number;
  completed: boolean;
  reportedTotal: number | null;
}

export async function scrapeCityAll(
  context: BrowserContext,
  url: string,
  maxHotels: number,
  onBatch: (batch: ListingHotel[]) => Promise<void>
): Promise<FullCityResult> {
  const page = await context.newPage();
  const seen = new Set<string>();
  const pending: ListingHotel[] = [];
  let reportedTotal: number | null = null;

  const onResponse = async (res: Response): Promise<void> => {
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('application/json')) return;
      if (!/makemytrip\.com/.test(res.url())) return;
      const body = await res.json().catch(() => null);
      if (!body) return;
      const hotels = findHotelsInResponse(body);
      if (hotels.length === 0) return;
      for (const raw of hotels) {
        const parsed = parseHotelRaw(raw);
        if (!parsed || seen.has(parsed.mmtHotelId)) continue;
        seen.add(parsed.mmtHotelId);
        pending.push(parsed);
      }
    } catch {
      // ignore
    }
  };
  page.on('response', onResponse);

  let totalScraped = 0;
  let completed = false;

  try {
    logger.info({ url, maxHotels }, 'Loading full-city listing page');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);

    const state = await page
      .evaluate(() => (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ ?? null)
      .catch(() => null);

    if (state && typeof state === 'object') {
      const s = state as Record<string, unknown>;
      const total = pickNumber(s, ['hotelListing', 'totalHotelsCount']);
      if (total) reportedTotal = total;
      const initial = extractHotelsFromState(s);
      for (const h of initial) {
        if (seen.has(h.mmtHotelId)) continue;
        seen.add(h.mmtHotelId);
        pending.push(h);
      }
    }

    const flush = async (): Promise<void> => {
      if (pending.length === 0) return;
      const batch = pending.splice(0, pending.length);
      await onBatch(batch);
      totalScraped += batch.length;
      logger.info({ totalScraped, reportedTotal }, 'Batch persisted');
    };

    await flush();

    let noProgressIterations = 0;
    const maxIterations = 400;
    for (let i = 0; i < maxIterations; i++) {
      if (totalScraped >= maxHotels) {
        completed = true;
        break;
      }
      if (reportedTotal && totalScraped >= reportedTotal) {
        completed = true;
        break;
      }

      const before = totalScraped + pending.length;
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(900 + Math.floor(Math.random() * 700));
      await flush();
      const after = totalScraped + pending.length;

      if (after === before) {
        noProgressIterations++;
        if (noProgressIterations >= 10) {
          completed = true;
          break;
        }
      } else {
        noProgressIterations = 0;
      }
    }

    await flush();
  } finally {
    page.off('response', onResponse);
    await page.close().catch(() => undefined);
  }

  return { total: totalScraped, completed, reportedTotal };
}

function findHotelsInResponse(body: unknown): unknown[] {
  const collected: unknown[] = [];
  const stack: unknown[] = [body];
  const visited = new WeakSet<object>();
  const MAX_NODES = 2000;
  let scanned = 0;

  while (stack.length && scanned < MAX_NODES) {
    const cur = stack.pop();
    scanned++;
    if (!cur || typeof cur !== 'object') continue;
    if (visited.has(cur as object)) continue;
    visited.add(cur as object);

    if (Array.isArray(cur)) {
      const first = cur[0];
      if (looksLikeHotel(first)) {
        for (const item of cur) if (looksLikeHotel(item)) collected.push(item);
        continue;
      }
      for (const child of cur) stack.push(child);
      continue;
    }

    for (const v of Object.values(cur as Record<string, unknown>)) stack.push(v);
  }
  return collected;
}

function looksLikeHotel(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return false;
  return 'geoLocation' in o || 'priceDetail' in o || 'starRating' in o;
}

function pickNumber(s: Record<string, unknown>, path: string[]): number | null {
  let cur: unknown = s;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}
