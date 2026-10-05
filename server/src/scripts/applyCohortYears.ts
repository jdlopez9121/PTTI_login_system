import 'dotenv/config'
import prisma from '../lib/prisma'
async function main() {
  // Enrollment years cannot be inferred reliably from upload timestamps.
  await prisma.$executeRaw`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "cohort_start_year" INTEGER`
  console.log('students: cohort start year column ready')
}
main().catch((err) => {
  console.error('Cohort year initialization failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
