import type { CalendarNotificationInput } from './notificationService'

export interface MicrosoftGraphDateTime {
  dateTime?: string
  timeZone?: string
}

export interface MicrosoftGraphCalendarEvent {
  id?: string
  subject?: string | null
  bodyPreview?: string | null
  start?: MicrosoftGraphDateTime | null
  end?: MicrosoftGraphDateTime | null
  isCancelled?: boolean | null
}

export interface CalendarNotificationMappingOptions {
  calendarEmail: string
  timeZone?: string
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function parseGraphDate(value: MicrosoftGraphDateTime | null | undefined): Date | null {
  const raw = clean(value?.dateTime)
  if (!raw) return null

  // Microsoft Graph may return either an ISO instant with Z/offset or a local
  // date-time plus a Windows time zone. For v1 we request Prefer: outlook.timezone="UTC",
  // so no-offset strings are treated as UTC consistently by appending Z.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
  return new Date(hasOffset ? raw : `${raw}Z`)
}

export function mapGraphEventToCalendarNotification(
  event: MicrosoftGraphCalendarEvent,
  options: CalendarNotificationMappingOptions
): CalendarNotificationInput {
  const externalId = clean(event.id)
  if (!externalId) throw new Error('Graph event id is required')

  const startsAt = parseGraphDate(event.start)
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    throw new Error(`Graph event ${externalId} has an invalid start date`)
  }

  const endsAt = parseGraphDate(event.end)
  const title = clean(event.subject) || 'Calendar event'
  const body = clean(event.bodyPreview) || `Today: ${title}`

  return {
    calendarId: clean(options.calendarEmail).toLowerCase(),
    externalId,
    title,
    body,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    audience: 'all',
    priority: 'normal',
  }
}
