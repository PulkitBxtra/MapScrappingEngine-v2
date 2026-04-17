import type { BrowserContext, Page } from 'playwright';
import { logger } from '../logger.js';
import { extractCoordsFromMapElements, findLatLng } from './mapCoords.js';

export interface HotelDetail {
  description: string | null;
  address: string | null;
  city: string | null;
  amenities: string[];
  imageUrls: string[];
  latitude: number | null;
  longitude: number | null;
  rawJsonLd: unknown;
}

export async function scrapeDetail(context: BrowserContext, detailUrl: string): Promise<HotelDetail> {
  const page = await context.newPage();
  let coordsFromXhr: { lat: number; lng: number } | null = null;

  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!/latlong|geo|map|detail/i.test(url)) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('application/json')) return;
      const body = await res.json().catch(() => null);
      if (!body || typeof body !== 'object') return;
      const found = findLatLng(body);
      if (found && !coordsFromXhr) coordsFromXhr = found;
    } catch {
      // ignore
    }
  });

  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);

    for (let i = 0; i < 2; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(400);
    }

    const jsonLd = await extractJsonLd(page);
    const ldCoords = findLatLng(jsonLd);

    const domData = await page.evaluate(() => {
      const q = (sel: string) => document.querySelector(sel);
      const description =
        q('[data-testid="about-property"]')?.textContent?.trim() ||
        q('.aboutHotel')?.textContent?.trim() ||
        q('#overview')?.textContent?.trim() ||
        null;
      const address =
        q('[data-testid="hotel-address"]')?.textContent?.trim() ||
        q('.hotelAddress')?.textContent?.trim() ||
        q('[itemprop="address"]')?.textContent?.trim() ||
        null;

      const amenities = Array.from(
        document.querySelectorAll('[data-testid="amenity-item"], .amenitiesItem, .amenityName, .mainAmenity')
      )
        .map((n) => (n as HTMLElement).innerText.trim())
        .filter(Boolean);

      const imageUrls = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
        .map((img) => img.currentSrc || img.src || img.getAttribute('data-src') || '')
        .filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u) && /mmtcdn|makemytrip|cloudfront|imgak/i.test(u));

      return {
        description,
        address,
        amenities: Array.from(new Set(amenities)),
        imageUrls: Array.from(new Set(imageUrls)),
      };
    });

    let lat: number | null = null;
    let lng: number | null = null;
    if (ldCoords) {
      lat = ldCoords.lat;
      lng = ldCoords.lng;
    } else if (coordsFromXhr) {
      lat = (coordsFromXhr as { lat: number; lng: number }).lat;
      lng = (coordsFromXhr as { lat: number; lng: number }).lng;
    } else {
      const mapCoords = await extractCoordsFromMapElements(page);
      if (mapCoords) {
        lat = mapCoords.lat;
        lng = mapCoords.lng;
      }
    }

    return {
      description: domData.description,
      address: domData.address,
      city: extractCityFromJsonLd(jsonLd),
      amenities: domData.amenities,
      imageUrls: domData.imageUrls.slice(0, 40),
      latitude: lat,
      longitude: lng,
      rawJsonLd: jsonLd,
    };
  } catch (err) {
    logger.warn({ err, detailUrl }, 'Detail scrape failed');
    return {
      description: null,
      address: null,
      city: null,
      amenities: [],
      imageUrls: [],
      latitude: null,
      longitude: null,
      rawJsonLd: null,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function extractJsonLd(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
    const parsed: unknown[] = [];
    for (const s of scripts) {
      try {
        parsed.push(JSON.parse(s.textContent || 'null'));
      } catch {
        // skip invalid JSON-LD blocks
      }
    }
    return parsed;
  });
}

function extractCityFromJsonLd(jsonLd: unknown): string | null {
  if (!Array.isArray(jsonLd)) return null;
  for (const entry of jsonLd) {
    if (entry && typeof entry === 'object') {
      const address = (entry as Record<string, unknown>).address;
      if (address && typeof address === 'object') {
        const city = (address as Record<string, unknown>).addressLocality;
        if (typeof city === 'string') return city;
      }
    }
  }
  return null;
}
