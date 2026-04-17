import type { Page } from 'playwright';

export function findLatLng(obj: unknown): { lat: number; lng: number } | null {
  if (!obj || typeof obj !== 'object') return null;
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    const rec = cur as Record<string, unknown>;
    const latRaw = rec.latitude ?? rec.lat ?? rec.Latitude;
    const lngRaw = rec.longitude ?? rec.lng ?? rec.lon ?? rec.Longitude;
    const lat = typeof latRaw === 'string' ? parseFloat(latRaw) : (latRaw as number | undefined);
    const lng = typeof lngRaw === 'string' ? parseFloat(lngRaw) : (lngRaw as number | undefined);
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    ) {
      return { lat, lng };
    }
    for (const val of Object.values(rec)) {
      if (val && typeof val === 'object') stack.push(val);
    }
  }
  return null;
}

export async function extractCoordsFromMapElements(page: Page): Promise<{ lat: number; lng: number } | null> {
  const iframeSrc = await page
    .$eval('iframe[src*="google.com/maps"]', (el) => (el as HTMLIFrameElement).src)
    .catch(() => null);
  if (iframeSrc) {
    const m = iframeSrc.match(/q=([\-\d.]+),([\-\d.]+)/) || iframeSrc.match(/!2d([\-\d.]+)!3d([\-\d.]+)/);
    if (m) {
      const a = parseFloat(m[1] ?? '');
      const b = parseFloat(m[2] ?? '');
      if (Number.isFinite(a) && Number.isFinite(b)) {
        if (/!2d/.test(iframeSrc)) return { lat: b, lng: a };
        return { lat: a, lng: b };
      }
    }
  }

  const staticMap = await page
    .$eval('img[src*="staticmap"]', (el) => (el as HTMLImageElement).src)
    .catch(() => null);
  if (staticMap) {
    const m = staticMap.match(/center=([\-\d.]+),([\-\d.]+)/);
    if (m) {
      const lat = parseFloat(m[1] ?? '');
      const lng = parseFloat(m[2] ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }

  return null;
}
