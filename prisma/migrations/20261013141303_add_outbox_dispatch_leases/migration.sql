-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "locked_by" TEXT,
ADD COLUMN     "locked_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "outbox_events_locked_until_idx" ON "outbox_events"("locked_until");
