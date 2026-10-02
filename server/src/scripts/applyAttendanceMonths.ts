import prisma from '../lib/prisma'
import { prepareAttendanceMonths } from '../services/monthlyAttendanceService'

async function main() {
  // Existing Docker deployments use idempotent startup DDL rather than migrate deploy.
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "attendance_months" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "dates" TEXT[] NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "attendance_months_year_month_key"
    ON "attendance_months"("year", "month")
  `
  await prepareAttendanceMonths()
  console.log('attendance_months: current and upcoming grades ready')
}

main().catch((err) => {
  console.error('Monthly attendance initialization failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
