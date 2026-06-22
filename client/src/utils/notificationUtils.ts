import type { NotificationAudience, NotificationPriority, NotificationSource } from '../api'

type ArchiveSemantics = {
  source: NotificationSource
  createdById: string | null
}

type AudienceSemantics = {
  audience: NotificationAudience
  subject?: string | null
  shift?: string | null
  roomName?: string | null
}

export function formatNotificationSource(source: NotificationSource): string {
  if (source === 'manual') return 'Teacher'
  if (source === 'calendar') return 'Calendar'
  if (source === 'email') return 'Email'
  return source
}

export function formatTimeRemaining(expiresAt: string | null, now = new Date()): string {
  if (!expiresAt) return 'No expiry'
  const expires = new Date(expiresAt).getTime()
  const remainingMs = expires - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expired'

  const totalMinutes = Math.ceil(remainingMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m remaining`
  if (minutes === 0) return `${hours}h remaining`
  return `${hours}h ${minutes}m remaining`
}

export function canArchiveNotification(notification: ArchiveSemantics, teacherId: string): boolean {
  if (notification.source !== 'manual') return true
  return !notification.createdById || notification.createdById === teacherId
}

export function notificationAudienceLabel(notification: AudienceSemantics): string {
  if (notification.audience === 'subject') return `Subject: ${notification.subject || '—'}`
  if (notification.audience === 'shift') return `Shift: ${notification.shift || '—'}`
  if (notification.audience === 'room') return `Room: ${notification.roomName || '—'}`
  return 'All teachers'
}

export function priorityBadgeClass(priority: NotificationPriority): string {
  if (priority === 'urgent') return 'badge-red'
  if (priority === 'important') return 'badge-blue'
  return 'badge-gray'
}
