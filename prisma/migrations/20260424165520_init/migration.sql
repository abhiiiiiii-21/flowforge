-- CreateEnum
CREATE TYPE "RunScope" AS ENUM ('FULL', 'PARTIAL', 'SINGLE');

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "scope" "RunScope" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "userId" TEXT NOT NULL DEFAULT 'anonymous',
ADD COLUMN     "workflowId" TEXT;

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Workflow',
    "graph" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflows_userId_idx" ON "workflows"("userId");

-- CreateIndex
CREATE INDEX "runs_userId_idx" ON "runs"("userId");

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
