import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  archiveNotification,
  getActiveNotifications,
  type Teacher,
  type TeacherNotification,
} from '../api'
import { canArchiveNotification } from '../utils/notificationUtils'
import AddNotificationModal from './AddNotificationModal'

type Props = {
  teacher: Teacher
  currentShift: string
  roomName: string
}

export default function ActiveNotificationsPanel({ teacher, currentShift, roomName }: Props) {
  const [notifications, setNotifications] = useState<TeacherNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

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
        <h2>Notifications</h2>
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
                <div className="notification-main">
                  <div className="notification-copy">
                    <h3>{notification.title}</h3>
                    {notification.body && <p>{notification.body}</p>}
                  </div>
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
