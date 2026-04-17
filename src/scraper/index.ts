import { logger } from '../logger.js';
import { repo } from '../db/repo.js';
import { launchBrowser, newContext } from './browser.js';
import { scrapeListing, type ListingHotel } from './listing.js';
import { scrapeCityAll } from './cityAll.js';
import { buildMmtSearchUrl } from './urlBuilder.js';

export async function runScrapeJob(searchId: string): Promise<void> {
  const search = await repo.getSearch(searchId);
  if (!search) throw new Error(`Search ${searchId} not found`);

  await repo.updateSearchStatus(searchId, 'running');

  const browser = await launchBrowser();
  const context = await newContext(browser);

  try {
    const page = await context.newPage();
    const searchUrl = buildMmtSearchUrl({
      city: search.city,
      checkIn: search.checkIn.toISOString().slice(0, 10),
      checkOut: search.checkOut.toISOString().slice(0, 10),
      adults: search.adults,
      children: search.children,
      rooms: search.rooms,
      limit: search.limit,
    });

    const hotels: ListingHotel[] = await scrapeListing(page, searchUrl, search.limit);
    await page.close();

    logger.info({ searchId, count: hotels.length }, 'Upserting hotels');

    for (const h of hotels) {
      await repo.upsertHotel({
        searchId,
        mmtHotelId: h.mmtHotelId,
        name: h.name,
        starRating: h.starRating,
        userRating: h.userRating,
        userRatingCount: h.userRatingCount,
        priceInr: h.priceInr,
        originalPriceInr: h.originalPriceInr,
        discountPct: h.discountPct,
        address: h.address,
        locality: h.locality,
        city: h.city ?? search.city,
        latitude: h.latitude,
        longitude: h.longitude,
        description: h.description,
        amenities: h.amenities,
        imageUrls: h.imageUrls,
        thumbnailUrl: h.thumbnailUrl,
        detailUrl: h.detailUrl,
        raw: h.raw,
      });
    }

    await repo.updateSearchStatus(searchId, 'completed', { completedAt: new Date() });
    logger.info({ searchId, hotelCount: hotels.length }, 'Scrape job completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, searchId }, 'Scrape job failed');
    await repo.updateSearchStatus(searchId, 'failed', { errorMsg: message, completedAt: new Date() });
    throw err;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function runFullCityScrapeJob(searchId: string): Promise<void> {
  const search = await repo.getSearch(searchId);
  if (!search) throw new Error(`Search ${searchId} not found`);

  await repo.updateSearchStatus(searchId, 'running');

  const browser = await launchBrowser();
  const context = await newContext(browser);

  try {
    const searchUrl = buildMmtSearchUrl({
      city: search.city,
      checkIn: search.checkIn.toISOString().slice(0, 10),
      checkOut: search.checkOut.toISOString().slice(0, 10),
      adults: search.adults,
      children: search.children,
      rooms: search.rooms,
      limit: search.limit,
    });

    const onBatch = async (batch: ListingHotel[]): Promise<void> => {
      for (const h of batch) {
        await repo.upsertHotel({
          searchId,
          mmtHotelId: h.mmtHotelId,
          name: h.name,
          starRating: h.starRating,
          userRating: h.userRating,
          userRatingCount: h.userRatingCount,
          priceInr: h.priceInr,
          originalPriceInr: h.originalPriceInr,
          discountPct: h.discountPct,
          address: h.address,
          locality: h.locality,
          city: h.city ?? search.city,
          latitude: h.latitude,
          longitude: h.longitude,
          description: h.description,
          amenities: h.amenities,
          imageUrls: h.imageUrls,
          thumbnailUrl: h.thumbnailUrl,
          detailUrl: h.detailUrl,
          raw: h.raw,
        });
      }
    };

    const result = await scrapeCityAll(context, searchUrl, search.limit, onBatch);
    logger.info({ searchId, ...result }, 'Full city scrape finished');

    await repo.updateSearchStatus(searchId, 'completed', { completedAt: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, searchId }, 'Full city scrape failed');
    await repo.updateSearchStatus(searchId, 'failed', { errorMsg: message, completedAt: new Date() });
    throw err;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
