import type { ScrapeRequest } from '../schemas/scrape.js';

function toMMDDYYYY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}${d}${y}`;
}

function toSlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildMmtSearchUrl(req: ScrapeRequest): string {
  const checkin = toMMDDYYYY(req.checkIn);
  const checkout = toMMDDYYYY(req.checkOut);
  const roomStayQualifier = `${req.rooms}e${req.adults}e` + (req.children > 0 ? `${req.children}e` : '');
  const rsc = `${req.rooms}e${req.adults}e${req.children}e`;

  if (req.hotelName && req.hotelName.trim().length > 0) {
    const params = new URLSearchParams({
      checkin,
      checkout,
      country: 'IN',
      roomStayQualifier,
      rsc,
      searchText: req.hotelName.trim(),
      regionNearByExp: '3',
    });
    return `https://www.makemytrip.com/hotels/hotel-listing/?${params.toString()}`;
  }

  const params = new URLSearchParams({
    checkin,
    checkout,
    roomStayQualifier,
    rsc,
    regionNearByExp: '3',
  });
  const slug = toSlug(req.city);
  return `https://www.makemytrip.com/hotels/${slug}-hotels.html?${params.toString()}`;
}
