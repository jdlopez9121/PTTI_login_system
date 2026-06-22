import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  archiveNotification,
  getActiveNotifications,
  type Teacher,
  type TeacherNotification,
} from '../api'
import {
  canArchiveNotification,
  formatNotificationSource,
  formatTimeRemaining,
  notificationAudienceLabel,
  priorityBadgeClass,
} from '../utils/notificationUtils'
import AddNotificationModal from './AddNotificationModal'

type Props = {
  teacher: Teacher
  currentShift: string
  roomName: string
}

function notificationTimestamp(notification: TeacherNotification): string {
  const sourceTime = notification.sourceStartAt ?? notification.startsAt ?? notification.createdAt
  return new Date(sourceTime).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ActiveNotificationsPanel({ teacher, currentShift, roomName }: Props) {
  const [notifications, setNotifications] = useState<TeacherNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const filters = useMemo(() => ({
    subject: teacher.subject1,
    shift: currentShift && currentShift !== 'all' ? currentShift : teacher.shift,
    roomName: roomName !== 'Unknown Room' ? roomName : undefined,
  }), [currentShift, roomName, teacher.shift, teacher.subject1])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotifications(await getActiveNotifications(filters))
      setNow(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const archive = async (notification: TeacherNotification) => {
    setError('')
    try {
      await archiveNotification(notification.id)
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive notification')
    }
  }

  return (
    <section className="notifications-panel">
      <div className="notifications-header">
        <div>
          <h2>Active Notifications</h2>
          <p>Teacher and calendar notices visible for your subject, shift, room, or all teachers.</p>
        </div>
        <div className="notifications-actions">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Notification</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && notifications.length === 0 ? (
        <p className="notifications-empty">Loading notifications…</p>
      ) : notifications.length === 0 ? (
        <p className="notifications-empty">No active notifications.</p>
      ) : (
        <div className="notifications-list">
          {notifications.map((notification) => {
            const archiveAllowed = canArchiveNotification(notification, teacher.id)
            return (
              <article key={notification.id} className={`notification-card notification-${notification.priority}`}>
                <div className="notification-card-head">
                  <div>
                    <div className="notification-badges">
                      <span className="badge badge-green">{formatNotificationSource(notification.source)}</span>
                      <span className={`badge ${priorityBadgeClass(notification.priority)}`}>{notification.priority}</span>
                      <span className="badge badge-gray">{notificationAudienceLabel(notification)}</span>
                    </div>
                    <h3>{notification.title}</h3>
                  </div>
                  <div className="notification-time">
                    <strong>{formatTimeRemaining(notification.expiresAt, now)}</strong>
                    <span>{notificationTimestamp(notification)}</span>
                  </div>
                </div>
                <p>{notification.body}</p>
                <div className="notification-footer">
                  <span>{notification.source === 'calendar' ? 'Read-only calendar source' : notification.source === 'manual' ? 'Teacher-created' : 'Email source'}</span>
                  <button className="btn btn-secondary" onClick={() => archive(notification)} disabled={!archiveAllowed} title={archiveAllowed ? 'Hide this notification' : 'Only the creating teacher can hide this manual notification'}>
                    Hide
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddNotificationModal
          defaultSubject={teacher.subject1}
          defaultShift={teacher.shift}
          defaultRoomName={roomName !== 'Unknown Room' ? roomName : ''}
          onClose={() => setShowAdd(false)}
          onCreated={(notification) => {
            setShowAdd(false)
            setNotifications((prev) => [notification, ...prev])
          }}
        />
      )}
    </section>
  )
}
