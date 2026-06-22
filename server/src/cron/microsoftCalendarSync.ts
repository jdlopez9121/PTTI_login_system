import cron from 'node-cron'
import { getMicrosoftCalendarConfig, describeMicrosoftCalendarConfigIssue } from '../config/microsoftCalendarConfig'
import prisma from '../lib/prisma'
import { syncMicrosoftCalendar } from '../services/microsoftCalendarService'

export function scheduleMicrosoftCalendarSync(): void {
  const config = getMicrosoftCalendarConfig()
  if (!config.enabled) {
    console.log(`[microsoft-calendar] ${describeMicrosoftCalendarConfigIssue(config)}`)
    return
  }

  if (!cron.validate(config.values.syncCron)) {
    console.log(`[microsoft-calendar] sync disabled: MICROSOFT_CALENDAR_SYNC_CRON is invalid (${config.values.syncCron})`)
    return
  }

  cron.schedule(config.values.syncCron, async () => {
    try {
      const result = await syncMicrosoftCalendar({ prisma, config })
      if (result.skipped) {
        console.log(`[microsoft-calendar] ${result.reason}`)
        return
      }
      console.log(`[microsoft-calendar] synced ${result.fetched} event(s), upserted ${result.upserted}, archived ${result.archived}`)
    } catch (error) {
      console.error('[microsoft-calendar] sync failed:', error)
    }
  })

  console.log(`[microsoft-calendar] sync scheduled (${config.values.syncCron})`)
}
