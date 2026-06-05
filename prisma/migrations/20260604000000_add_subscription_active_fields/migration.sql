-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subscriptions" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
