-- CreateTable
CREATE TABLE "neighbourhoods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "captain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neighbourhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighbourhood_desks" (
    "id" TEXT NOT NULL,
    "neighbourhoodId" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighbourhood_desks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighbourhood_members" (
    "id" TEXT NOT NULL,
    "neighbourhoodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighbourhood_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighbourhood_rules" (
    "id" TEXT NOT NULL,
    "neighbourhoodId" TEXT NOT NULL,
    "fieldType" "RestrictionFieldType" NOT NULL,
    "operator" "RestrictionOperator" NOT NULL,
    "value" JSONB NOT NULL,
    "connector" "RuleConnector" NOT NULL DEFAULT 'OR',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighbourhood_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "neighbourhoods_organizationId_idx" ON "neighbourhoods"("organizationId");

-- CreateIndex
CREATE INDEX "neighbourhoods_floorId_idx" ON "neighbourhoods"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "neighbourhoods_floorId_name_key" ON "neighbourhoods"("floorId", "name");

-- CreateIndex
CREATE INDEX "neighbourhood_desks_deskId_idx" ON "neighbourhood_desks"("deskId");

-- CreateIndex
CREATE UNIQUE INDEX "neighbourhood_desks_neighbourhoodId_deskId_key" ON "neighbourhood_desks"("neighbourhoodId", "deskId");

-- CreateIndex
CREATE INDEX "neighbourhood_members_userId_idx" ON "neighbourhood_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "neighbourhood_members_neighbourhoodId_userId_key" ON "neighbourhood_members"("neighbourhoodId", "userId");

-- CreateIndex
CREATE INDEX "neighbourhood_rules_neighbourhoodId_idx" ON "neighbourhood_rules"("neighbourhoodId");

-- AddForeignKey
ALTER TABLE "neighbourhoods" ADD CONSTRAINT "neighbourhoods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhoods" ADD CONSTRAINT "neighbourhoods_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood_desks" ADD CONSTRAINT "neighbourhood_desks_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "neighbourhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood_desks" ADD CONSTRAINT "neighbourhood_desks_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "desks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood_members" ADD CONSTRAINT "neighbourhood_members_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "neighbourhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood_members" ADD CONSTRAINT "neighbourhood_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood_rules" ADD CONSTRAINT "neighbourhood_rules_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "neighbourhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
