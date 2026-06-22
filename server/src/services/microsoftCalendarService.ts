import { type MicrosoftCalendarConfig, describeMicrosoftCalendarConfigIssue } from '../config/microsoftCalendarConfig'
import { mapGraphEventToCalendarNotification, type MicrosoftGraphCalendarEvent } from './calendarNotificationMapper'
import { acquireMicrosoftGraphToken } from './microsoftGraphAuth'
import { upsertCalendarNotification, type NotificationServicePrisma } from './notificationService'

export interface MicrosoftGraphCalendarClient {
  listCalendarView(startDateTime: Date, endDateTime: Date): Promise<MicrosoftGraphCalendarEvent[]>
}

export interface MicrosoftCalendarSyncOptions {
  prisma: NotificationServicePrisma
  config: MicrosoftCalendarConfig
  graphClient?: MicrosoftGraphCalendarClient
  now?: Date
}

export interface MicrosoftCalendarSyncResult {
  skipped: boolean
  reason?: string
  fetched: number
  upserted: number
  archived: number
  windowStart: Date
  windowEnd: Date
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function graphCalendarViewUrl(config: MicrosoftCalendarConfig, startDateTime: Date, endDateTime: Date): string {
  const params = new URLSearchParams({
    startDateTime: startDateTime.toISOString(),
    endDateTime: endDateTime.toISOString(),
    '$select': 'id,subject,bodyPreview,start,end,isCancelled,lastModifiedDateTime,webLink',
    '$orderby': 'start/dateTime',
    '$top': '50',
  })

  // Device-code v1 signs in as the account that owns the calendar. If a different
  // mailbox is configured and permissions allow it, Graph accepts /users/{email}.
  const calendarEmail = encodeURIComponent(config.values.calendarEmail ?? '')
  return `https://graph.microsoft.com/v1.0/users/${calendarEmail}/calendarView?${params.toString()}`
}

export async function createMicrosoftGraphCalendarClient(config: MicrosoftCalendarConfig): Promise<MicrosoftGraphCalendarClient> {
  const accessToken = await acquireMicrosoftGraphToken(config)

  return {
    async listCalendarView(startDateTime: Date, endDateTime: Date): Promise<MicrosoftGraphCalendarEvent[]> {
      const events: MicrosoftGraphCalendarEvent[] = []
      let url: string | undefined = graphCalendarViewUrl(config, startDateTime, endDateTime)

      while (url) {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: `outlook.timezone="UTC"`,
          },
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`Microsoft Graph calendarView failed (${response.status}): ${body}`)
        }
        const payload: any = await response.json()
        events.push(...(payload.value ?? []))
        url = payload['@odata.nextLink']
      }

      return events
    },
  }
}

export async function archiveCalendarNotificationByExternalId(
  prisma: NotificationServicePrisma,
  calendarId: string,
  externalId: string,
  now = new Date()
): Promise<boolean> {
  const rows = await prisma.notification.findMany({
    where: {
      source: 'calendar',
      sourceCalendarId: calendarId,
      sourceExternalId: externalId,
      archivedAt: null,
    },
  })

  for (const row of rows) {
    await prisma.notification.update({ where: { id: row.id }, data: { archivedAt: now } })
  }
  return rows.length > 0
}

async function archiveMissingCalendarNotifications(
  prisma: NotificationServicePrisma,
  calendarId: string,
  seenExternalIds: string[],
  windowStart: Date,
  windowEnd: Date,
  now: Date
): Promise<number> {
  const candidates = await prisma.notification.findMany({
    where: {
      source: 'calendar',
      sourceCalendarId: calendarId,
      archivedAt: null,
      sourceStartAt: { gte: windowStart, lte: windowEnd },
    },
  })
  const seen = new Set(seenExternalIds)
  let archived = 0

  for (const notification of candidates) {
    if (notification.sourceExternalId && !seen.has(notification.sourceExternalId)) {
      await prisma.notification.update({ where: { id: notification.id }, data: { archivedAt: now } })
      archived += 1
    }
  }

  return archived
}

export async function syncMicrosoftCalendar(options: MicrosoftCalendarSyncOptions): Promise<MicrosoftCalendarSyncResult> {
  const now = options.now ?? new Date()
  const windowStart = addDays(now, -options.config.values.lookbackDays)
  const windowEnd = addDays(now, options.config.values.lookaheadDays)

  if (!options.config.enabled || !options.config.values.calendarEmail) {
    return {
      skipped: true,
      reason: describeMicrosoftCalendarConfigIssue(options.config),
      fetched: 0,
      upserted: 0,
      archived: 0,
      windowStart,
      windowEnd,
    }
  }

  const graphClient = options.graphClient ?? await createMicrosoftGraphCalendarClient(options.config)
  const events = await graphClient.listCalendarView(windowStart, windowEnd)
  let upserted = 0
  let archived = 0
  const seenExternalIds: string[] = []
  const calendarEmail = options.config.values.calendarEmail

  for (const event of events) {
    if (!event.id) continue
    seenExternalIds.push(event.id)
    if (event.isCancelled) {
      if (await archiveCalendarNotificationByExternalId(options.prisma, calendarEmail, event.id, now)) archived += 1
      continue
    }

    const notification = mapGraphEventToCalendarNotification(event, {
      calendarEmail,
      timeZone: options.config.values.timeZone,
    })
    await upsertCalendarNotification(options.prisma, notification, now)
    upserted += 1
  }

  archived += await archiveMissingCalendarNotifications(options.prisma, calendarEmail, seenExternalIds, windowStart, windowEnd, now)

  return {
    skipped: false,
    fetched: events.length,
    upserted,
    archived,
    windowStart,
    windowEnd,
  }
}
