import assert from 'node:assert/strict'
import { getMicrosoftCalendarConfig } from '../src/config/microsoftCalendarConfig'
import { mapGraphEventToCalendarNotification } from '../src/services/calendarNotificationMapper'
import { syncMicrosoftCalendar } from '../src/services/microsoftCalendarService'
import type { NotificationServicePrisma } from '../src/services/notificationService'

function makePrisma(initialNotifications: any[] = []): NotificationServicePrisma & { rows: any[] } {
  const rows = [...initialNotifications]
  let nextId = rows.length + 1

  const matchesWhere = (row: any, where: any): boolean => {
    if (!where) return true
    if (where.archivedAt === null && row.archivedAt !== null && row.archivedAt !== undefined) return false
    if (where.source && row.source !== where.source) return false
    if (where.sourceCalendarId && row.sourceCalendarId !== where.sourceCalendarId) return false
    if (where.sourceExternalId && row.sourceExternalId !== where.sourceExternalId) return false
    if (where.sourceExternalId?.notIn && where.sourceExternalId.notIn.includes(row.sourceExternalId)) return false
    if (where.sourceStartAt?.gte && row.sourceStartAt < where.sourceStartAt.gte) return false
    if (where.sourceStartAt?.lte && row.sourceStartAt > where.sourceStartAt.lte) return false
    return true
  }

  return {
    rows,
    notification: {
      create: async ({ data }: any) => {
        const row = { id: `n-${nextId++}`, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
        rows.push(row)
        return row
      },
      findMany: async ({ where }: any = {}) => rows.filter((row) => matchesWhere(row, where)),
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id)
        if (!row) throw new Error('not found')
        Object.assign(row, data)
        return row
      },
      upsert: async ({ where, create, update }: any) => {
        const key = where.source_sourceCalendarId_sourceExternalId
        const found = rows.find((row) => row.source === key.source && row.sourceCalendarId === key.sourceCalendarId && row.sourceExternalId === key.sourceExternalId)
        if (found) {
          Object.assign(found, update)
          return found
        }
        const row = { id: `n-${nextId++}`, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...create }
        rows.push(row)
        return row
      },
    },
  }
}

async function testMissingConfigDisablesSyncWithActionableReasons() {
  const config = getMicrosoftCalendarConfig({}, '/app/server')

  assert.equal(config.enabled, false)
  assert(config.reasons.includes('MICROSOFT_GRAPH_CLIENT_ID is required'))
  assert(config.reasons.includes('MICROSOFT_GRAPH_TENANT_ID is required'))
  assert(config.reasons.includes('MICROSOFT_CALENDAR_EMAIL is required'))
  assert.equal(config.values.syncCron, '*/30 * * * *')
  assert.equal(config.values.lookbackDays, 1)
  assert.equal(config.values.lookaheadDays, 7)
  assert.equal(config.values.tokenCachePath, '/app/server/.data/msal-token-cache.json')
}

async function testGraphEventMappingUsesTeacherDashboardDefaultsAndFortyEightHourExpiry() {
  const notification = mapGraphEventToCalendarNotification({
    id: 'event-1',
    subject: 'Graduation setup',
    bodyPreview: 'Bring projector',
    start: { dateTime: '2026-06-17T09:00:00.0000000', timeZone: 'Eastern Standard Time' },
    end: { dateTime: '2026-06-17T10:00:00.0000000', timeZone: 'Eastern Standard Time' },
    isCancelled: false,
  }, {
    calendarEmail: 'calendar@ptti.edu',
    timeZone: 'America/New_York',
  })

  assert.equal(notification.calendarId, 'calendar@ptti.edu')
  assert.equal(notification.externalId, 'event-1')
  assert.equal(notification.title, 'Graduation setup')
  assert.equal(notification.body, 'Bring projector')
  assert.equal(notification.audience, 'all')
  assert.equal(notification.priority, 'normal')
  assert.equal(notification.startsAt.toISOString(), '2026-06-17T09:00:00.000Z')
  assert.equal(notification.endsAt?.toISOString(), '2026-06-17T10:00:00.000Z')
}

async function testSyncIsIdempotentAndArchivesMissingOrCancelledEvents() {
  const prisma = makePrisma([
    {
      id: 'old-missing',
      title: 'Old event',
      body: 'Old',
      audience: 'all',
      priority: 'normal',
      source: 'calendar',
      sourceCalendarId: 'calendar@ptti.edu',
      sourceExternalId: 'missing-event',
      sourceStartAt: new Date('2026-06-17T11:00:00.000Z'),
      sourceEndAt: new Date('2026-06-17T12:00:00.000Z'),
      startsAt: new Date('2026-06-17T11:00:00.000Z'),
      expiresAt: new Date('2026-06-19T11:00:00.000Z'),
      archivedAt: null,
    },
  ])
  const now = new Date('2026-06-16T12:00:00.000Z')
  const graphClient = {
    listCalendarView: async () => ([
      {
        id: 'event-1',
        subject: 'Graduation setup',
        bodyPreview: 'Bring projector',
        start: { dateTime: '2026-06-17T09:00:00.000Z', timeZone: 'UTC' },
        end: { dateTime: '2026-06-17T10:00:00.000Z', timeZone: 'UTC' },
        isCancelled: false,
      },
      {
        id: 'cancelled-event',
        subject: 'Cancelled meeting',
        bodyPreview: '',
        start: { dateTime: '2026-06-17T13:00:00.000Z', timeZone: 'UTC' },
        end: { dateTime: '2026-06-17T14:00:00.000Z', timeZone: 'UTC' },
        isCancelled: true,
      },
    ]),
  }

  const config = getMicrosoftCalendarConfig({
    MICROSOFT_GRAPH_CLIENT_ID: 'client-id',
    MICROSOFT_GRAPH_TENANT_ID: 'tenant-id',
    MICROSOFT_CALENDAR_EMAIL: 'calendar@ptti.edu',
  }, '/app/server')

  const first = await syncMicrosoftCalendar({ prisma, config, graphClient, now })
  const second = await syncMicrosoftCalendar({ prisma, config, graphClient, now })

  assert.equal(first.fetched, 2)
  assert.equal(first.upserted, 1)
  assert.equal(first.archived, 1)
  assert.equal(second.upserted, 1)
  assert.equal(prisma.rows.filter((row) => row.sourceExternalId === 'event-1').length, 1)
  assert(prisma.rows.find((row) => row.id === 'old-missing')?.archivedAt instanceof Date)
}

async function run() {
  await testMissingConfigDisablesSyncWithActionableReasons()
  await testGraphEventMappingUsesTeacherDashboardDefaultsAndFortyEightHourExpiry()
  await testSyncIsIdempotentAndArchivesMissingOrCancelledEvents()
  console.log('microsoftCalendarService tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
