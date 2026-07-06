import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "work_order_student_videos" (
      "id" TEXT NOT NULL,
      "teacher_id" TEXT NOT NULL,
      "title" TEXT,
      "original_url" TEXT NOT NULL,
      "embed_url" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "work_order_student_videos_pkey" PRIMARY KEY ("id")
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "work_order_student_videos_created_at_idx"
    ON "work_order_student_videos"("created_at")
  `)

  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'work_order_student_videos_teacher_id_fkey'
        AND table_name = 'work_order_student_videos'
    ) AS "exists"
  `)

  if (!rows[0]?.exists) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "work_order_student_videos"
      ADD CONSTRAINT "work_order_student_videos_teacher_id_fkey"
      FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `)
  }

  console.log('work_order_student_videos: table ready')

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "work_order_tickets"
    ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "archived_by_id" TEXT
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "work_order_tickets_archived_at_idx"
    ON "work_order_tickets"("archived_at")
  `)

  console.log('work_order_tickets: archive columns ready')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('applyStudentVideos error:', err)
  process.exit(1)
})
