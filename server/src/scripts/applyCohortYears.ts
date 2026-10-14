import 'dotenv/config'
import prisma from '../lib/prisma'
async function main() {
  // Legacy students belong to 2026; preserve years supplied by newer uploads.
  await prisma.$executeRaw`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "cohort_start_year" INTEGER`
  const updated = await prisma.$executeRaw`
    UPDATE "students" SET "cohort_start_year" = 2026
    WHERE "cohort_start_year" IS NULL
  `
  console.log(`students: cohort start year column ready; assigned 2026 to ${updated} legacy students`)
}
main().catch((err) => {
  console.error('Cohort year initialization failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
