import cron from 'node-cron'
import prisma from '../lib/prisma'

// Runs on the 1st of every month at midnight
// Marks students who have completed the 5-month program as floating
export function scheduleMonthlyRotation(): void {
  cron.schedule('0 0 1 * *', async () => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    // Mark students whose program_month would now be 6 (just completed month 5)
    // program_month = 6 when cohort_start_month is exactly 5 months ago
    let targetCohortMonth = currentMonth - 5
    if (targetCohortMonth <= 0) targetCohortMonth += 12

    const result = await prisma.student.updateMany({
      where: {
        isActive: true,
        isFloating: false,
        cohortStartMonth: targetCohortMonth,
      },
      data: { isFloating: true },
    })

    console.log(`[Monthly Rotation] ${now.toISOString()} — marked ${result.count} students as floating (cohort month ${targetCohortMonth})`)
  })

  console.log('[Cron] Monthly rotation scheduled (1st of each month at midnight)')
}
