import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { logger } from '../logger.js';

export interface ListingHotel {
  mmtHotelId: string;
  name: string;
  propertyType: string | null;
  starRating: number | null;
  userRating: number | null;
  userRatingCount: number | null;
  priceInr: number | null;
  originalPriceInr: number | null;
  discountPct: number | null;
  address: string | null;
  locality: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  amenities: string[];
  imageUrls: string[];
  thumbnailUrl: string | null;
  detailUrl: string | null;
  raw: Record<string, unknown>;
}

export async function scrapeListing(page: Page, url: string, limit: number): Promise<ListingHotel[]> {
  logger.info({ url }, 'Loading listing page');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);

  await page.waitForFunction(
    () => typeof (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ !== 'undefined',
    undefined,
    { timeout: 30_000 }
  ).catch(() => undefined);

  const state = await page.evaluate(
    () => (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ ?? null
  );

  if (!state || typeof state !== 'object') {
    logger.warn({ url }, '__INITIAL_STATE__ not found on page');
    await dumpEvidence(page, state, 'no-initial-state');
    return [];
  }

  const hotels = extractHotels(state as Record<string, unknown>);
  logger.info({ count: hotels.length }, 'Parsed hotels from __INITIAL_STATE__');
  if (hotels.length === 0) await dumpEvidence(page, state, 'zero-hotels');
  return hotels.slice(0, limit);
}

async function dumpEvidence(page: Page, state: unknown, tag: string): Promise<void> {
  try {
    const outDir = join(process.cwd(), 'tmp');
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(outDir, `${stamp}-${tag}`);
    const html = await page.content();
    writeFileSync(`${base}.html`, html, 'utf8');
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => undefined);
    const sliced = summarizeState(state);
    writeFileSync(`${base}.state.json`, JSON.stringify(sliced, null, 2), 'utf8');
    logger.warn({ dumpDir: base, finalUrl: page.url() }, 'Zero-hotel evidence saved');
  } catch (err) {
    logger.warn({ err }, 'Failed to write debug dump');
  }
}

function summarizeState(state: unknown): unknown {
  if (!state || typeof state !== 'object') return { note: 'state not an object', value: state };
  const s = state as Record<string, unknown>;
  const sections = pick<unknown[]>(s, ['searchHotels', 'personalizedSections']);
  const cards = pick<unknown[]>(s, ['hotelListing', 'mobLandingData', 'cardResponseData', 'cards']);
  return {
    topLevelKeys: Object.keys(s),
    requestInfo: pick<unknown>(s, ['requestInfo', 'globalSettings']) ?? null,
    searchHotels: {
      personalizedSectionCount: Array.isArray(sections) ? sections.length : null,
      firstSectionSample: Array.isArray(sections) && sections[0] ? summarizeSection(sections[0]) : null,
      logData: pick<unknown>(s, ['searchHotels', 'logData']) ?? null,
      totalHotels: pick<unknown>(s, ['hotelListing', 'totalHotelsCount']) ?? null,
    },
    mobLandingCards: Array.isArray(cards)
      ? cards.map((c) => ({
          cardId: (c as Record<string, unknown>)?.cardId,
          cardSubId: (c as Record<string, unknown>)?.cardSubId,
        }))
      : null,
  };
}

function summarizeSection(section: unknown): unknown {
  if (!section || typeof section !== 'object') return null;
  const s = section as Record<string, unknown>;
  const hotels = Array.isArray(s.hotels) ? s.hotels : [];
  return {
    name: s.name,
    hotelCount: hotels.length,
    firstHotel: hotels[0]
      ? {
          id: (hotels[0] as Record<string, unknown>).id,
          name: (hotels[0] as Record<string, unknown>).name,
        }
      : null,
  };
}

export function extractHotelsFromState(state: Record<string, unknown>): ListingHotel[] {
  return extractHotels(state);
}

function extractHotels(state: Record<string, unknown>): ListingHotel[] {
  const sections = pick<unknown[]>(state, ['searchHotels', 'personalizedSections']) ?? [];
  const collected: ListingHotel[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    const rawHotels = (section as Record<string, unknown>).hotels;
    if (!Array.isArray(rawHotels)) continue;
    for (const raw of rawHotels) {
      const parsed = parseHotel(raw);
      if (!parsed || seen.has(parsed.mmtHotelId)) continue;
      seen.add(parsed.mmtHotelId);
      collected.push(parsed);
    }
  }

  if (collected.length === 0) {
    const fallback = pick<unknown[]>(state, ['hotelListing', 'mobLandingData', 'cardResponseData', 'cards']) ?? [];
    for (const card of fallback) {
      const inner = pick<unknown[]>(card as Record<string, unknown>, ['cardData', 'cardPayLoad', 'hotels']) ?? [];
      for (const raw of inner) {
        const parsed = parseHotel(raw);
        if (!parsed || seen.has(parsed.mmtHotelId)) continue;
        seen.add(parsed.mmtHotelId);
        collected.push(parsed);
      }
    }
  }

  return collected;
}

export function parseHotelRaw(raw: unknown): ListingHotel | null {
  return parseHotel(raw);
}

function parseHotel(raw: unknown): ListingHotel | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  const id = str(h.id);
  const name = str(h.name);
  if (!id || !name) return null;

  const priceDetail = obj(h.priceDetail);
  const reviewSummary = obj(h.reviewSummary);
  const geo = obj(h.geoLocation);
  const address = obj(h.address);
  const locationDetail = obj(h.locationDetail);

  const priceInr = num(priceDetail?.discountedPrice) ?? num(priceDetail?.displayPrice) ?? num(priceDetail?.price);
  const originalPriceInr = num(priceDetail?.price);
  const discountPct =
    priceInr && originalPriceInr && originalPriceInr > priceInr
      ? Math.round(((originalPriceInr - priceInr) / originalPriceInr) * 100)
      : null;

  const amenities = strArr(h.facilityHighlights);
  const imageUrls = extractImages(h);
  const thumbnailUrl = imageUrls[0] ?? null;
  const description = extractDescription(h);
  const locality = extractLocality(h, address);

  return {
    mmtHotelId: id,
    name,
    propertyType: str(h.propertyType),
    starRating: num(h.starRating),
    userRating: num(reviewSummary?.cumulativeRating),
    userRatingCount: num(reviewSummary?.totalRatingCount) ?? num(reviewSummary?.totalReviewCount),
    priceInr,
    originalPriceInr,
    discountPct,
    address: str(address?.line1),
    locality,
    city: str(locationDetail?.name) ?? str(locationDetail?.cityName),
    latitude: num(geo?.latitude),
    longitude: num(geo?.longitude),
    description,
    amenities,
    imageUrls,
    thumbnailUrl,
    detailUrl: str(h.detailDeeplinkUrl) ?? str(h.seoUrl),
    raw: {
      categories: h.categories,
      locationPersuasion: h.locationPersuasion,
      hotelType: h.hotelType,
      sponsored: h.sponsored,
    },
  };
}

function extractImages(h: Record<string, unknown>): string[] {
  const media = Array.isArray(h.media) ? h.media : [];
  const urls: string[] = [];
  for (const m of media) {
    const u = str((m as Record<string, unknown>).url);
    if (u) urls.push(normalizeImageUrl(u));
  }
  const main = Array.isArray(h.mainImages) ? h.mainImages : [];
  for (const u of main) {
    const s = typeof u === 'string' ? normalizeImageUrl(u) : null;
    if (s && !urls.includes(s)) urls.push(s);
  }
  return urls;
}

function normalizeImageUrl(u: string): string {
  let out = u.trim();
  if (out.startsWith('//')) out = `https:${out}`;
  return out;
}

function extractDescription(h: Record<string, unknown>): string | null {
  const pers = obj(h.hotelPersuasions);
  if (!pers) return null;
  for (const key of ['PC_BOTTOM_BOX', 'PC_MIDDLE_9', 'PC_MIDDLE_8']) {
    const block = obj(pers[key]);
    const data = Array.isArray(block?.data) ? block!.data : [];
    for (const item of data) {
      const text = str((item as Record<string, unknown>).text);
      if (text && text.length > 10) return text.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

function extractLocality(h: Record<string, unknown>, address: Record<string, unknown> | null): string | null {
  const fromAddr = str(address?.line2);
  if (fromAddr) return fromAddr;
  const persuasion = Array.isArray(h.locationPersuasion) ? h.locationPersuasion : [];
  const first = persuasion[0];
  return typeof first === 'string' ? first : null;
}

function pick<T>(source: Record<string, unknown> | null | undefined, path: string[]): T | null {
  let cur: unknown = source;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return (cur as T | null | undefined) ?? null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}
