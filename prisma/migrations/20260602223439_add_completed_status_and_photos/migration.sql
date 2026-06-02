-- AlterEnum
ALTER TYPE "ServiceRequestStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "photos" TEXT[];
