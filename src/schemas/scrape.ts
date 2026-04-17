import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

export const scrapeRequestSchema = z
  .object({
    city: z.string().min(2).max(80),
    hotelName: z.string().min(2).max(120).optional(),
    checkIn: dateString,
    checkOut: dateString,
    adults: z.number().int().min(1).max(8).default(2),
    children: z.number().int().min(0).max(6).default(0),
    rooms: z.number().int().min(1).max(5).default(1),
    limit: z.number().int().min(1).max(60).default(30),
  })
  .refine((v) => new Date(v.checkOut) > new Date(v.checkIn), {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

export const fullCityRequestSchema = z
  .object({
    city: z.string().min(2).max(80),
    checkIn: dateString,
    checkOut: dateString,
    adults: z.number().int().min(1).max(8).default(2),
    children: z.number().int().min(0).max(6).default(0),
    rooms: z.number().int().min(1).max(5).default(1),
    maxHotels: z.number().int().min(1).max(5000).default(500),
  })
  .refine((v) => new Date(v.checkOut) > new Date(v.checkIn), {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });

export type FullCityRequest = z.infer<typeof fullCityRequestSchema>;
