import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { registerScrapeRoutes } from './routes/scrape.js';
import { registerWorker } from './queue/worker.js';
import { stopBoss } from './queue/boss.js';
import { prisma } from './db/client.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
  });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  await registerScrapeRoutes(app);
  await registerWorker();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`MMT scraping engine listening on :${config.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await app.close().catch(() => undefined);
    await stopBoss().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
