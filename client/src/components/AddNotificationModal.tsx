import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  createNotification,
  type CreateNotificationInput,
  type NotificationAudience,
  type NotificationPriority,
  type TeacherNotification,
} from '../api'

type Props = {
  defaultSubject?: string
  defaultShift?: string
  defaultRoomName?: string
  onClose: () => void
  onCreated: (notification: TeacherNotification) => void
}

const AUDIENCES: { value: NotificationAudience; label: string }[] = [
  { value: 'all', label: 'All teachers' },
  { value: 'subject', label: 'My subject' },
  { value: 'shift', label: 'My shift' },
  { value: 'room', label: 'This room' },
]
const PRIORITIES: { value: NotificationPriority; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
]

export default function AddNotificationModal({ defaultSubject, defaultShift, defaultRoomName, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<NotificationAudience>('all')
  const [priority, setPriority] = useState<NotificationPriority>('normal')
  const [subject, setSubject] = useState(defaultSubject ?? '')
  const [shift, setShift] = useState(defaultShift ?? '')
  const [roomName, setRoomName] = useState(defaultRoomName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload: CreateNotificationInput = { title, body, audience, priority }
      if (audience === 'subject') payload.subject = subject
      if (audience === 'shift') payload.shift = shift
      if (audience === 'room') payload.roomName = roomName
      const notification = await createNotification(payload)
      onCreated(notification)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notification')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} style={{ width: 'min(560px, 95vw)' }}>
        <div className="modal-header">
          <div>
            <h2>New Notification</h2>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
              Teacher-created notifications stay active for 48 hours.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div className="form-group">
          <label>Title</label>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </div>
        <div className="form-group">
          <label>Body</label>
          <textarea className="input" value={body} onChange={(event) => setBody(event.target.value)} rows={4} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label>Audience</label>
            <select className="input" value={audience} onChange={(event) => setAudience(event.target.value as NotificationAudience)}>
              {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as NotificationPriority)}>
              {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>

        {audience === 'subject' && (
          <div className="form-group">
            <label>Subject</label>
            <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} required />
          </div>
        )}
        {audience === 'shift' && (
          <div className="form-group">
            <label>Shift</label>
            <select className="input" value={shift} onChange={(event) => setShift(event.target.value)} required>
              <option value="">Select shift</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
              <option value="night">Night</option>
            </select>
          </div>
        )}
        {audience === 'room' && (
          <div className="form-group">
            <label>Room</label>
            <input className="input" value={roomName} onChange={(event) => setRoomName(event.target.value)} required />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : '+ Notification'}</button>
        </div>
      </form>
    </div>
  )
}
