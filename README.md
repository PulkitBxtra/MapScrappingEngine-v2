# MapScrappingEngine
# MMT Hotel Scraping Engine

Async REST API that scrapes MakeMyTrip hotel listings (with detail data + lat/lng) into Postgres.

> **ToS caveat:** MakeMyTrip's Terms of Service generally prohibit automated scraping. This repo is provided as-is for research/internal use. Keep concurrency low and respect rate limits — running this aggressively will get you blocked.

## Stack

- Node.js 20 + TypeScript
- Fastify (HTTP API)
- Playwright + stealth (headless browser scraping)
- pg-boss (job queue — uses Postgres, no Redis required)
- Prisma (schema + migrations)
- Managed Postgres (Supabase / Neon / RDS)

## Setup

```bash
# 1. Install deps
npm install
npx playwright install chromium

# 2. Configure env
cp .env.example .env
# then edit .env and set DATABASE_URL to your managed Postgres URL

# 3. Run Prisma migration (creates Search and Hotel tables)
npx prisma migrate dev --name init

# 4. Start the server (worker is registered in-process)
npm run dev
```

Server listens on `:3000` by default.

## API

### POST `/scrape`
Enqueue a scrape for a search query.

```bash
curl -X POST localhost:3000/scrape \
  -H 'content-type: application/json' \
  -d '{
    "city": "Goa",
    "checkIn": "2026-05-01",
    "checkOut": "2026-05-03",
    "adults": 2,
    "children": 0,
    "rooms": 1,
    "limit": 20
  }'
```

Response (`202 Accepted`):
```json
{
  "searchId": "…",
  "jobId": "…",
  "status": "queued",
  "pollUrl": "/jobs/<searchId>"
}
```

### GET `/jobs/:searchId`
Poll for status. Hotels array is included once `status === "completed"`.

```bash
curl localhost:3000/jobs/<searchId>
```

Response:
```json
{
  "searchId": "…",
  "status": "completed",
  "createdAt": "…",
  "completedAt": "…",
  "hotelCount": 18,
  "hotels": [ { "name": "...", "latitude": 15.5, "longitude": 73.7, ... } ]
}
```

Statuses: `queued` → `running` → `completed` | `failed`.

## Data model

| Table    | Purpose                                                  |
| -------- | -------------------------------------------------------- |
| `Search` | One row per search query; tracks status and job id.      |
| `Hotel`  | One row per scraped hotel; unique on `(searchId, mmtHotelId)`. Stores name, pricing, rating, locality, address, `latitude`/`longitude`, `imageUrls` (JSON array), `amenities`, description, and a `raw` JSON blob for debugging. |

`pg-boss` creates its own `pgboss` schema on first run.

## How scraping works

1. POST creates a `Search` row and enqueues a pg-boss job.
2. Worker launches a stealthy Chromium context (en-IN, Asia/Kolkata, randomized UA).
3. Listing page is scraped for ~20–30 cards (name, price, rating, thumbnail, detail URL, MMT hotel id).
4. Each detail page is then visited sequentially (800–1500 ms jitter):
   - JSON-LD block is parsed for `geo.latitude`/`geo.longitude` and `addressLocality`.
   - If no coords there, responses are sniffed for geo JSON and map iframe / static-map URLs are parsed as fallbacks.
   - Gallery images, amenities, full address, and description are extracted from the DOM.
5. Each hotel is upserted keyed by `(searchId, mmtHotelId)`.
6. `Search.status` is flipped to `completed` (or `failed` with `errorMsg`).

## Verifying end-to-end

```bash
# open a second terminal while `npm run dev` is running
SEARCH_ID=$(curl -s -X POST localhost:3000/scrape -H 'content-type: application/json' \
  -d '{"city":"Goa","checkIn":"2026-05-01","checkOut":"2026-05-03","adults":2,"rooms":1,"limit":20}' \
  | jq -r .searchId)

watch -n 3 "curl -s localhost:3000/jobs/$SEARCH_ID | jq '{status, hotelCount}'"

# browse rows directly
npx prisma studio
```

## Configuration

| Env var                | Default | Notes                                      |
| ---------------------- | ------- | ------------------------------------------ |
| `DATABASE_URL`         | —       | Managed Postgres connection string.        |
| `PORT`                 | 3000    | HTTP port.                                 |
| `LOG_LEVEL`            | info    | pino level.                                |
| `SCRAPE_HEADLESS`      | true    | Set `false` to watch the browser locally.  |
| `DETAIL_JITTER_MIN_MS` | 800     | Min delay between detail-page visits.      |
| `DETAIL_JITTER_MAX_MS` | 1500    | Max delay between detail-page visits.      |

## Notes on selectors

MMT's DOM changes frequently. All selectors live in `src/scraper/listing.ts` and `src/scraper/detail.ts`; if results come back empty, start there.



<!-- // ------------------------------------------------ -->

<!-- Deplyment steps

  1. cp .env.example .env and set DATABASE_URL to your managed Postgres.
  2. npx playwright install chromium (downloads the browser — skipped to save time).
  3. npx prisma migrate dev --name init.
  4. npm run dev, then POST /scrape and poll GET /jobs/:searchId. -->