ALTER TABLE "work_order_tickets"
ADD COLUMN "archived_at" TIMESTAMPTZ,
ADD COLUMN "archived_by_id" TEXT;

CREATE INDEX "work_order_tickets_archived_at_idx" ON "work_order_tickets"("archived_at");
