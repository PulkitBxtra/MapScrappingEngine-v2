import PgBoss from 'pg-boss';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const SCRAPE_QUEUE = 'scrape-hotels';
export const SCRAPE_CITY_ALL_QUEUE = 'scrape-city-all';

let instance: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (instance) return instance;
  const boss = new PgBoss({ connectionString: config.DATABASE_URL });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  await boss.createQueue(SCRAPE_QUEUE);
  await boss.createQueue(SCRAPE_CITY_ALL_QUEUE);
  instance = boss;
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (instance) {
    await instance.stop({ graceful: true });
    instance = null;
  }
}
