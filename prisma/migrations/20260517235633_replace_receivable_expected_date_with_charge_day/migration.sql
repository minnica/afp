/*
  Warnings:

  - You are about to drop the column `expectedDate` on the `receivable_accounts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "receivable_accounts" DROP COLUMN "expectedDate",
ADD COLUMN     "expectedChargeDay" INTEGER;
