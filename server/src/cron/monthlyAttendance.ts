import cron from 'node-cron'
import { prepareAttendanceMonths, SCHOOL_TIME_ZONE } from '../services/monthlyAttendanceService'

export function scheduleMonthlyAttendance(): void {
  const prepare = async () => {
    try {
      await prepareAttendanceMonths()
    } catch (err) {
      console.error('[Cron] Monthly attendance preparation failed', err)
    }
  }
  // Pre-create the upcoming month, retry daily, and catch up after a restart.
  cron.schedule('50 23 * * *', prepare, { timezone: SCHOOL_TIME_ZONE })
  void prepare()
}
