-- CreateTable
CREATE TABLE "Search" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "limit" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "mmtHotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starRating" DOUBLE PRECISION,
    "userRating" DOUBLE PRECISION,
    "userRatingCount" INTEGER,
    "priceInr" INTEGER,
    "originalPriceInr" INTEGER,
    "discountPct" INTEGER,
    "address" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT,
    "amenities" JSONB,
    "imageUrls" JSONB,
    "thumbnailUrl" TEXT,
    "detailUrl" TEXT,
    "raw" JSONB,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Search_status_idx" ON "Search"("status");

-- CreateIndex
CREATE INDEX "Search_city_idx" ON "Search"("city");

-- CreateIndex
CREATE INDEX "Hotel_city_idx" ON "Hotel"("city");

-- CreateIndex
CREATE INDEX "Hotel_latitude_longitude_idx" ON "Hotel"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_searchId_mmtHotelId_key" ON "Hotel"("searchId", "mmtHotelId");

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
