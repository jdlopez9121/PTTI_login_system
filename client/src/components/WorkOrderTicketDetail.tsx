import { useEffect, useState } from 'react'
import {
  type WorkOrderStatus,
  type WorkOrderTicket,
  addWorkOrderMessage,
  archiveWorkOrderTicket,
  cancelWorkOrderTicket,
  deleteWorkOrderTicket,
  getWorkOrderTicket,
  updateWorkOrderTicket,
  workOrderPhotoSrc,
} from '../api'
import { formatDisplayName } from '../utils/formatName'

type Props = {
  ticketId: string
  onChanged: (ticket: WorkOrderTicket) => void
  onDeleted: (ticket?: WorkOrderTicket) => void
}

const STATUSES: WorkOrderStatus[] = ['open', 'assigned', 'in_progress', 'submitted_completed', 'completed', 'cancelled']
const statusLabel = (status: WorkOrderStatus) => status.replace(/_/g, ' ')

function assigneeLabel(ticket: WorkOrderTicket) {
  if (ticket.assigneeType === 'student' && ticket.assigneeStudent) {
    return `${formatDisplayName(ticket.assigneeStudent.fullName)} (${ticket.assigneeStudent.studentId})`
  }
  if (ticket.assigneeType === 'teacher' && ticket.assigneeTeacher) return `${ticket.assigneeTeacher.name} (${ticket.assigneeTeacher.email})`
  return 'Unassigned'
}

export default function WorkOrderTicketDetail({ ticketId, onChanged, onDeleted }: Props) {
  const [ticket, setTicket] = useState<WorkOrderTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [workPerformed, setWorkPerformed] = useState('')
  const [messageBody, setMessageBody] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getWorkOrderTicket(ticketId)
      setTicket(data)
      setWorkPerformed(data.workPerformed ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work order')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (changes: Parameters<typeof updateWorkOrderTicket>[1], ok: string) => {
    if (!ticket) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateWorkOrderTicket(ticket.id, changes)
      setTicket(updated)
      setWorkPerformed(updated.workPerformed ?? '')
      onChanged(updated)
      setSuccess(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save work order')
    } finally {
      setSaving(false)
    }
  }

  const addMessage = async () => {
    if (!ticket || !messageBody.trim()) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await addWorkOrderMessage(ticket.id, messageBody.trim())
      setMessageBody('')
      await load()
      setSuccess('Teacher-only message posted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post message')
    } finally {
      setSaving(false)
    }
  }

  const cancelTicket = async () => {
    if (!ticket) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const cancelled = await cancelWorkOrderTicket(ticket.id)
      setTicket(cancelled)
      onDeleted(cancelled)
      setSuccess('Work order cancelled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel work order')
    } finally {
      setSaving(false)
    }
  }

  const archiveTicket = async () => {
    if (!ticket) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const archived = await archiveWorkOrderTicket(ticket.id)
      setTicket(archived)
      onDeleted(archived)
      setSuccess('Work order archived.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive work order')
    } finally {
      setSaving(false)
    }
  }

  const deleteTicket = async () => {
    if (!ticket) return
    const confirmed = window.confirm('Permanently delete this work order? This cannot be undone.')
    if (!confirmed) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await deleteWorkOrderTicket(ticket.id)
      onDeleted()
      setTicket(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete work order')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--gray-400)', padding: '1rem' }}>Loading ticket…</p>
  if (!ticket) return <p style={{ color: 'var(--gray-500)', padding: '1rem' }}>Select a work order to view details.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2>{ticket.title}</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>
            {ticket.templateNameSnapshot ?? 'Template'} {ticket.templateVersionSnapshot ? `— ${ticket.templateVersionSnapshot}` : ''}
          </p>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>Assigned to: {assigneeLabel(ticket)}</p>
        </div>
        <div className={`badge ${ticket.status === 'completed' ? 'badge-green' : ticket.status === 'cancelled' ? 'badge-gray' : 'badge-blue'}`} style={{ textTransform: 'capitalize' }}>
          {statusLabel(ticket.status)}
        </div>
      </div>

      {ticket.templatePhotoUrlSnapshot && (
        <img src={workOrderPhotoSrc(ticket.templatePhotoUrlSnapshot)} alt={ticket.templateNameSnapshot ?? ticket.title} style={{ width: '100%', maxHeight: 210, objectFit: 'contain', border: '1px solid var(--gray-200)', borderRadius: 8, background: '#fff' }} />
      )}

      <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--gray-200)', padding: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Issue</h3>
        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--gray-800)' }}>{ticket.issueDescription || 'No issue description.'}</p>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Work performed summary</label>
        <textarea className="input" rows={5} value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} placeholder="Summarize troubleshooting or completed work" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => save({ workPerformed }, 'Work performed saved.')}>Save Work Performed</button>
        <select className="input" value={ticket.status} onChange={(e) => save({ status: e.target.value as WorkOrderStatus }, 'Status updated.')} disabled={saving} style={{ width: 'auto', textTransform: 'capitalize' }}>
          {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        {ticket.status !== 'cancelled' && <button className="btn btn-secondary" disabled={saving} onClick={cancelTicket} style={{ color: 'var(--red)' }}>Cancel Ticket</button>}
        {(ticket.status === 'completed' || ticket.status === 'cancelled') && !ticket.archivedAt && (
          <button className="btn btn-secondary" disabled={saving} onClick={archiveTicket}>Archive</button>
        )}
        {(ticket.archivedAt || ticket.status === 'completed' || ticket.status === 'cancelled') && (
          <button className="btn btn-secondary" disabled={saving} onClick={deleteTicket} style={{ color: 'var(--red)' }}>Delete</button>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '0.75rem' }}>
        <h3>Teacher-only chat/activity</h3>
        <p style={{ color: 'var(--gray-600)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
          This area is not exposed in the student work-order dashboard.
        </p>
        <div style={{ maxHeight: 210, overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '0.75rem', background: 'var(--gray-50)', marginBottom: '0.75rem' }}>
          {!ticket.messages || ticket.messages.length === 0 ? (
            <p style={{ color: 'var(--gray-400)' }}>No messages yet.</p>
          ) : ticket.messages.map((message) => (
            <div key={message.id} style={{ borderBottom: '1px solid var(--gray-200)', padding: '0.45rem 0' }}>
              <strong style={{ fontSize: '0.82rem' }}>{message.teacher?.name ?? 'Teacher activity'}</strong>
              <span style={{ color: 'var(--gray-500)', fontSize: '0.75rem', marginLeft: '0.4rem' }}>{new Date(message.createdAt).toLocaleString()}</span>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{message.body}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <textarea className="input" rows={2} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Add teacher-only note" />
          <button className="btn btn-primary" disabled={saving || !messageBody.trim()} onClick={addMessage}>Post</button>
        </div>
      </div>
    </div>
  )
}
