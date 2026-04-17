import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, newContext } from '../src/scraper/browser.js';
import { buildMmtSearchUrl } from '../src/scraper/urlBuilder.js';

const city = process.argv[2] ?? 'Mumbai';
const checkIn = process.argv[3] ?? '2026-05-10';
const checkOut = process.argv[4] ?? '2026-05-12';

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });

  const url = buildMmtSearchUrl({
    city,
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    rooms: 1,
    limit: 20,
  });
  console.log('URL:', url);

  const browser = await launchBrowser();
  const context = await newContext(browser);
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(3000);

  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(500);
  }

  const finalUrl = page.url();
  const title = await page.title();
  console.log('Final URL:', finalUrl);
  console.log('Title:', title);

  const candidateSelectors = [
    'li.listingRow',
    '[data-testid="hotel-card"]',
    '.listingRowOuter',
    'li[id*="Hotel"]',
    'div[id*="Hotel"]',
    'a[href*="/hotels/"]',
    'article',
    'div.hlistpg_hotel_info',
    '.hsw_listing_card',
    'li[data-cy]',
    'div[data-cy*="hotel"]',
    'div[class*="HotelCard"]',
    'div[class*="hotelCard"]',
    'div[class*="listingRow"]',
    'h2, h3',
    'img',
  ];

  const counts = await page.evaluate((selectors) => {
    const result: Record<string, number> = {};
    for (const s of selectors) {
      try {
        result[s] = document.querySelectorAll(s).length;
      } catch {
        result[s] = -1;
      }
    }
    return result;
  }, candidateSelectors);

  console.log('\nSelector match counts:');
  for (const [sel, n] of Object.entries(counts)) console.log(`  ${n.toString().padStart(5)}  ${sel}`);

  const hotelLinks = await page.evaluate(() =>
    Array.from(new Set(
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/hotels/"]'))
        .map((a) => a.href)
        .filter((h) => /makemytrip\.com\/hotels\//.test(h))
    )).slice(0, 15)
  );
  console.log('\nSample hotel links:', hotelLinks);

  const html = await page.content();
  writeFileSync(join(outDir, 'listing.html'), html, 'utf8');
  await page.screenshot({ path: join(outDir, 'listing.png'), fullPage: true });
  console.log(`\nSaved: tmp/listing.html (${html.length} bytes), tmp/listing.png`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
