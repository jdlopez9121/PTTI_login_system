import type {
  Notification,
  NotificationAudience,
  NotificationPriority,
  NotificationSource,
  Shift,
} from '@prisma/client'

export const MANUAL_NOTIFICATION_TTL_HOURS = 48
export const STUDENT_POP_EMAIL_NOTIFICATION_TTL_HOURS = 12
export const STUDENT_POP_MAILBOX_ADDRESS = 'reports@ptt.edu'
export const STUDENT_POP_SUBJECT_TOKEN = 'student pop'
export const STUDENT_POP_NOTIFICATION_TEXT = 'Concerns list ready'

type NotificationOrderBy =
  | { priority: 'asc' | 'desc' }
  | { startsAt: 'asc' | 'desc' }
  | { createdAt: 'asc' | 'desc' }

export interface NotificationServicePrisma {
  notification: {
    create(args: { data: any }): Promise<Notification>
    findMany(args?: { where?: any; orderBy?: NotificationOrderBy[] | NotificationOrderBy }): Promise<Notification[]>
    findUnique(args: { where: { id: string } }): Promise<Notification | null>
    update(args: { where: { id: string }; data: any }): Promise<Notification>
    upsert(args: any): Promise<Notification>
  }
}

export interface CreateManualNotificationInput {
  title: string
  body: string
  audience?: NotificationAudience
  subject?: string | null
  shift?: Shift | null
  roomName?: string | null
  priority?: NotificationPriority
}

export interface ActiveNotificationFilters {
  subject?: string
  shift?: Shift
  roomName?: string
}

export interface CalendarNotificationInput {
  calendarId: string
  externalId: string
  title: string
  body?: string | null
  startsAt: Date
  endsAt?: Date | null
  audience?: NotificationAudience
  subject?: string | null
  shift?: Shift | null
  roomName?: string | null
  priority?: NotificationPriority
}

export interface StudentPopEmailNotificationInput {
  mailboxAddress: string
  messageId: string
  fromAddress?: string | null
  subject: string
  receivedAt: Date
}

export class NotificationServiceError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message)
    this.name = 'NotificationServiceError'
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeManualInput(input: CreateManualNotificationInput): Required<Pick<CreateManualNotificationInput, 'title' | 'body' | 'audience' | 'priority'>> & Omit<CreateManualNotificationInput, 'title' | 'body' | 'audience' | 'priority'> {
  const title = cleanText(input.title)
  const body = cleanText(input.body)
  if (!title) throw new NotificationServiceError('title is required')
  if (!body) throw new NotificationServiceError('body is required')

  return {
    title,
    body,
    audience: input.audience ?? 'all',
    priority: input.priority ?? 'normal',
    subject: input.subject ? cleanText(input.subject) : null,
    shift: input.shift ?? null,
    roomName: input.roomName ? cleanText(input.roomName) : null,
  }
}

function activeWhere(now: Date, filters: ActiveNotificationFilters = {}): Record<string, unknown> {
  const audienceClauses: Record<string, unknown>[] = [{ audience: 'all' }]
  if (filters.subject) audienceClauses.push({ audience: 'subject', subject: filters.subject })
  if (filters.shift) audienceClauses.push({ audience: 'shift', shift: filters.shift })
  if (filters.roomName) audienceClauses.push({ audience: 'room', roomName: filters.roomName })

  return {
    archivedAt: null,
    startsAt: { lte: now },
    expiresAt: { gt: now },
    OR: audienceClauses,
  }
}

export async function listActiveNotifications(
  prisma: NotificationServicePrisma,
  now = new Date(),
  filters: ActiveNotificationFilters = {}
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: activeWhere(now, filters),
    orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function listNotifications(prisma: NotificationServicePrisma): Promise<Notification[]> {
  return prisma.notification.findMany({
    orderBy: [{ createdAt: 'desc' }],
  })
}

export async function createManualNotification(
  prisma: NotificationServicePrisma,
  teacherId: string,
  input: CreateManualNotificationInput,
  now = new Date()
): Promise<Notification> {
  const normalized = normalizeManualInput(input)
  return prisma.notification.create({
    data: {
      ...normalized,
      source: 'manual',
      createdById: teacherId,
      startsAt: now,
      expiresAt: addHours(now, MANUAL_NOTIFICATION_TTL_HOURS),
    },
  })
}

export async function archiveNotification(
  prisma: NotificationServicePrisma,
  teacherId: string,
  notificationId: string,
  now = new Date()
): Promise<Notification> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notification) throw new NotificationServiceError('Notification not found', 404)

  if (notification.source === 'manual' && notification.createdById && notification.createdById !== teacherId) {
    throw new NotificationServiceError('Only the creating teacher can archive this manual notification', 403)
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { archivedAt: now },
  })
}

export async function upsertCalendarNotification(
  prisma: NotificationServicePrisma,
  event: CalendarNotificationInput,
  _now = new Date()
): Promise<Notification> {
  const title = cleanText(event.title) || 'Calendar event'
  const body = cleanText(event.body) || `Today: ${title}`
  const sourceCalendarId = cleanText(event.calendarId)
  const sourceExternalId = cleanText(event.externalId)
  if (!sourceCalendarId) throw new NotificationServiceError('calendarId is required')
  if (!sourceExternalId) throw new NotificationServiceError('externalId is required')

  const data = {
    title,
    body,
    audience: event.audience ?? 'all',
    subject: event.subject ? cleanText(event.subject) : null,
    shift: event.shift ?? null,
    roomName: event.roomName ? cleanText(event.roomName) : null,
    priority: event.priority ?? 'normal',
    source: 'calendar' as NotificationSource,
    sourceCalendarId,
    sourceExternalId,
    sourceStartAt: event.startsAt,
    sourceEndAt: event.endsAt ?? null,
    startsAt: event.startsAt,
    expiresAt: addHours(event.startsAt, MANUAL_NOTIFICATION_TTL_HOURS),
  }

  return prisma.notification.upsert({
    where: {
      source_sourceCalendarId_sourceExternalId: {
        source: 'calendar',
        sourceCalendarId,
        sourceExternalId,
      },
    },
    update: data,
    create: data,
  })
}

export async function upsertStudentPopEmailNotification(
  prisma: NotificationServicePrisma,
  email: StudentPopEmailNotificationInput,
  now = new Date()
): Promise<Notification | null> {
  const mailboxAddress = cleanText(email.mailboxAddress).toLowerCase()
  const sourceExternalId = cleanText(email.messageId)
  const subject = cleanText(email.subject)

  if (!mailboxAddress) throw new NotificationServiceError('mailboxAddress is required')
  if (!sourceExternalId) throw new NotificationServiceError('messageId is required')
  if (mailboxAddress !== STUDENT_POP_MAILBOX_ADDRESS) return null
  if (!subject.toLowerCase().includes(STUDENT_POP_SUBJECT_TOKEN)) return null

  const data = {
    title: STUDENT_POP_NOTIFICATION_TEXT,
    body: STUDENT_POP_NOTIFICATION_TEXT,
    audience: 'all' as NotificationAudience,
    subject: null,
    shift: null,
    roomName: null,
    priority: 'important' as NotificationPriority,
    source: 'email' as NotificationSource,
    sourceCalendarId: mailboxAddress,
    sourceExternalId,
    sourceStartAt: email.receivedAt,
    sourceEndAt: null,
    startsAt: now,
    expiresAt: addHours(now, STUDENT_POP_EMAIL_NOTIFICATION_TTL_HOURS),
  }

  return prisma.notification.upsert({
    where: {
      source_sourceCalendarId_sourceExternalId: {
        source: 'email',
        sourceCalendarId: mailboxAddress,
        sourceExternalId,
      },
    },
    update: data,
    create: data,
  })
}

export async function archiveExpiredNotifications(prisma: NotificationServicePrisma, now = new Date()): Promise<number> {
  const expired = await prisma.notification.findMany({
    where: {
      archivedAt: null,
      expiresAt: { lte: now },
    },
  })
  await Promise.all(expired.map((notification) => prisma.notification.update({
    where: { id: notification.id },
    data: { archivedAt: now },
  })))
  return expired.length
}
