import type { Prisma, Search } from '@prisma/client';
import { prisma } from './client.js';
import type { ScrapeRequest, FullCityRequest } from '../schemas/scrape.js';

export type SearchStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface HotelInput {
  searchId: string;
  mmtHotelId: string;
  name: string;
  starRating: number | null;
  userRating: number | null;
  userRatingCount: number | null;
  priceInr: number | null;
  originalPriceInr: number | null;
  discountPct: number | null;
  address: string | null;
  locality: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  amenities: string[];
  imageUrls: string[];
  thumbnailUrl: string | null;
  detailUrl: string | null;
  raw: unknown;
}

export const repo = {
  async createSearch(input: ScrapeRequest): Promise<Search> {
    return prisma.search.create({
      data: {
        city: input.city,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        adults: input.adults,
        children: input.children,
        rooms: input.rooms,
        limit: input.limit,
        status: 'queued',
      },
    });
  },

  async createFullCitySearch(input: FullCityRequest): Promise<Search> {
    return prisma.search.create({
      data: {
        city: input.city,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        adults: input.adults,
        children: input.children,
        rooms: input.rooms,
        limit: input.maxHotels,
        status: 'queued',
      },
    });
  },

  async setJobId(searchId: string, jobId: string): Promise<void> {
    await prisma.search.update({ where: { id: searchId }, data: { jobId } });
  },

  async updateSearchStatus(
    searchId: string,
    status: SearchStatus,
    extra: { errorMsg?: string; completedAt?: Date } = {}
  ): Promise<void> {
    await prisma.search.update({
      where: { id: searchId },
      data: { status, ...extra },
    });
  },

  async getSearch(searchId: string): Promise<Search | null> {
    return prisma.search.findUnique({ where: { id: searchId } });
  },

  async getSearchWithHotels(searchId: string) {
    return prisma.search.findUnique({
      where: { id: searchId },
      include: { hotels: { orderBy: { priceInr: 'asc' } } },
    });
  },

  async upsertHotel(input: HotelInput): Promise<void> {
    const data: Prisma.HotelUncheckedCreateInput = {
      searchId: input.searchId,
      mmtHotelId: input.mmtHotelId,
      name: input.name,
      starRating: input.starRating,
      userRating: input.userRating,
      userRatingCount: input.userRatingCount,
      priceInr: input.priceInr,
      originalPriceInr: input.originalPriceInr,
      discountPct: input.discountPct,
      address: input.address,
      locality: input.locality,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description,
      amenities: input.amenities as unknown as Prisma.InputJsonValue,
      imageUrls: input.imageUrls as unknown as Prisma.InputJsonValue,
      thumbnailUrl: input.thumbnailUrl,
      detailUrl: input.detailUrl,
      raw: (input.raw ?? {}) as Prisma.InputJsonValue,
    };

    await prisma.hotel.upsert({
      where: { searchId_mmtHotelId: { searchId: input.searchId, mmtHotelId: input.mmtHotelId } },
      create: data,
      update: data,
    });
  },
};
