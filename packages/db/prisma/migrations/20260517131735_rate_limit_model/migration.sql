-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT 'rl_' || gen_random_uuid(),
    "requestId" TEXT,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastRequest" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_entityId_key" ON "rate_limit"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE INDEX "rate_limit_requestId_idx" ON "rate_limit"("requestId");
