import type { FastifyInstance } from 'fastify';
import { scrapeRequestSchema, fullCityRequestSchema } from '../schemas/scrape.js';
import { repo } from '../db/repo.js';
import { enqueueScrape, enqueueFullCityScrape } from '../queue/worker.js';
import { prisma } from '../db/client.js';

export async function registerScrapeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/scrape', async (request, reply) => {
    const parsed = scrapeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const search = await repo.createSearch(parsed.data);
    const jobId = await enqueueScrape({ searchId: search.id });
    await repo.setJobId(search.id, jobId);

    return reply.code(202).send({
      searchId: search.id,
      jobId,
      status: 'queued',
      pollUrl: `/jobs/${search.id}`,
    });
  });

  app.post('/scrape/city/all', async (request, reply) => {
    const parsed = fullCityRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const search = await repo.createFullCitySearch(parsed.data);
    const jobId = await enqueueFullCityScrape({ searchId: search.id });
    await repo.setJobId(search.id, jobId);

    return reply.code(202).send({
      searchId: search.id,
      jobId,
      status: 'queued',
      mode: 'full-city',
      maxHotels: parsed.data.maxHotels,
      pollUrl: `/jobs/${search.id}`,
    });
  });

  app.get<{ Params: { searchId: string } }>('/jobs/:searchId', async (request, reply) => {
    const { searchId } = request.params;
    const search = await repo.getSearch(searchId);
    if (!search) {
      return reply.code(404).send({ error: 'NotFound', searchId });
    }

    const hotelCount = await prisma.hotel.count({ where: { searchId } });

    if (search.status !== 'completed') {
      return reply.send({
        searchId: search.id,
        status: search.status,
        createdAt: search.createdAt,
        completedAt: search.completedAt,
        errorMsg: search.errorMsg,
        hotelCount,
      });
    }

    const hotels = await prisma.hotel.findMany({
      where: { searchId },
      orderBy: { priceInr: 'asc' },
    });

    return reply.send({
      searchId: search.id,
      status: search.status,
      createdAt: search.createdAt,
      completedAt: search.completedAt,
      errorMsg: search.errorMsg,
      hotelCount,
      hotels,
    });
  });
}
