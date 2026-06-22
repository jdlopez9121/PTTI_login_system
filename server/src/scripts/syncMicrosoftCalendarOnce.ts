import 'dotenv/config'
import { getMicrosoftCalendarConfig, describeMicrosoftCalendarConfigIssue } from '../config/microsoftCalendarConfig'
import prisma from '../lib/prisma'
import { syncMicrosoftCalendar } from '../services/microsoftCalendarService'

async function run() {
  const config = getMicrosoftCalendarConfig()
  if (!config.enabled) {
    console.log(describeMicrosoftCalendarConfigIssue(config))
    return
  }

  console.log('Microsoft calendar sync started.')
  const result = await syncMicrosoftCalendar({ prisma, config })
  if (result.skipped) {
    console.log(result.reason)
    return
  }

  console.log(`Window: ${result.windowStart.toISOString()} to ${result.windowEnd.toISOString()}.`)
  console.log(`Fetched ${result.fetched} events.`)
  console.log(`Upserted ${result.upserted} notifications.`)
  console.log(`Archived ${result.archived} cancelled/deleted notifications.`)
  console.log('Microsoft calendar sync completed.')
}

run()
  .catch((error) => {
    console.error('Microsoft calendar sync failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
