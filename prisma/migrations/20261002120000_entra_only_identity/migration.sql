-- Microsoft Entra ID is the only sign-in/sign-up method (no HRIS, no Google).
-- Users are matched on their stable Entra object ID (`oid`), recorded at their
-- next sign-in; existing rows keep matching by email until then.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "entraObjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_entraObjectId_key" ON "users"("organizationId", "entraObjectId");

-- AlterTable: Google SSO is no longer supported, so its domain allow-list goes.
ALTER TABLE "organizations" DROP COLUMN "ssoGoogleDomains";
