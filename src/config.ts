import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SCRAPE_HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  DETAIL_JITTER_MIN_MS: z.coerce.number().int().nonnegative().default(800),
  DETAIL_JITTER_MAX_MS: z.coerce.number().int().nonnegative().default(1500),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
