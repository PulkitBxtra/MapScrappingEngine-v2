import { logger } from '../logger.js';
import { runScrapeJob, runFullCityScrapeJob } from '../scraper/index.js';
import { getBoss, SCRAPE_QUEUE, SCRAPE_CITY_ALL_QUEUE } from './boss.js';

export interface ScrapeJobPayload {
  searchId: string;
}

export async function registerWorker(): Promise<void> {
  const boss = await getBoss();

  await boss.work<ScrapeJobPayload>(
    SCRAPE_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { searchId } = job.data;
        logger.info({ jobId: job.id, searchId }, 'Worker picked up scrape job');
        await runScrapeJob(searchId);
      }
    }
  );

  await boss.work<ScrapeJobPayload>(
    SCRAPE_CITY_ALL_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { searchId } = job.data;
        logger.info({ jobId: job.id, searchId }, 'Worker picked up full-city scrape job');
        await runFullCityScrapeJob(searchId);
      }
    }
  );

  logger.info('Workers registered for queues: %s, %s', SCRAPE_QUEUE, SCRAPE_CITY_ALL_QUEUE);
}

export async function enqueueScrape(payload: ScrapeJobPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(SCRAPE_QUEUE, payload, { retryLimit: 1, retryDelay: 30 });
  if (!jobId) throw new Error('Failed to enqueue scrape job');
  return jobId;
}

export async function enqueueFullCityScrape(payload: ScrapeJobPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(SCRAPE_CITY_ALL_QUEUE, payload, { retryLimit: 0 });
  if (!jobId) throw new Error('Failed to enqueue full-city scrape job');
  return jobId;
}
