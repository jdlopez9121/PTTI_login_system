import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import {
  archiveNotification,
  createManualNotification,
  listActiveNotifications,
  listNotifications,
  NotificationServiceError,
  type ActiveNotificationFilters,
} from '../services/notificationService'
import type { NotificationAudience, NotificationPriority, Shift } from '@prisma/client'

const router = Router()

const VALID_AUDIENCES = new Set<NotificationAudience>(['all', 'subject', 'shift', 'room'])
const VALID_PRIORITIES = new Set<NotificationPriority>(['normal', 'important', 'urgent'])
const VALID_SHIFTS = new Set<Shift>(['morning', 'afternoon', 'evening', 'night'])

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof NotificationServiceError) {
    res.status(error.statusCode).json({ success: false, error: error.message })
    return
  }
  next(error)
}

function optionalEnum<T extends string>(value: unknown, allowed: Set<T>, name: string): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const text = String(value)
  if (!allowed.has(text as T)) throw new NotificationServiceError(`${name} is invalid`, 400)
  return text as T
}

function activeFiltersFromQuery(req: Request): ActiveNotificationFilters {
  return {
    subject: req.query.subject ? String(req.query.subject).trim() : undefined,
    shift: optionalEnum(req.query.shift, VALID_SHIFTS, 'shift'),
    roomName: req.query.roomName ? String(req.query.roomName).trim() : undefined,
  }
}

router.get('/active', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await listActiveNotifications(prisma, new Date(), activeFiltersFromQuery(req))
    res.json({ success: true, data: notifications })
  } catch (err) { handleServiceError(err, res, next) }
})

router.get('/', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await listNotifications(prisma)
    res.json({ success: true, data: notifications })
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, body, audience, subject, shift, roomName, priority } = req.body as Record<string, unknown>
    const notification = await createManualNotification(prisma, req.teacher!.teacherId, {
      title: String(title ?? ''),
      body: String(body ?? ''),
      audience: optionalEnum(audience, VALID_AUDIENCES, 'audience'),
      subject: subject ? String(subject).trim() : null,
      shift: optionalEnum(shift, VALID_SHIFTS, 'shift'),
      roomName: roomName ? String(roomName).trim() : null,
      priority: optionalEnum(priority, VALID_PRIORITIES, 'priority'),
    })
    res.status(201).json({ success: true, data: notification })
  } catch (err) { handleServiceError(err, res, next) }
})

router.post('/:id/archive', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await archiveNotification(prisma, req.teacher!.teacherId, req.params.id)
    res.json({ success: true, data: notification })
  } catch (err) { handleServiceError(err, res, next) }
})

export default router
