import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type StudentWorkOrderTicket,
  getStudentWorkOrderTickets,
  submitStudentWorkOrderCompleted,
  updateStudentWorkPerformed,
} from '../api'

const displayStatus = (status: string) => status.replace(/_/g, ' ')

export default function StudentWorkOrderPanel() {
  const [studentId, setStudentId] = useState('')
  const [searchedId, setSearchedId] = useState('')
  const [tickets, setTickets] = useState<StudentWorkOrderTicket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workPerformed, setWorkPerformed] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [selectedId, tickets])

  useEffect(() => {
    if (selected) setWorkPerformed(selected.workPerformed ?? '')
  }, [selected])

  const loadTickets = async (idOverride?: string) => {
    const id = (idOverride ?? studentId).trim()
    if (!id) return
    setLoading(true)
    setMessage(null)
    try {
      const data = await getStudentWorkOrderTickets(id)
      setTickets(data)
      setSearchedId(id)
      setSelectedId(data[0]?.id ?? null)
      setMessage(data.length === 0 ? { type: 'warning', text: 'No assigned work orders found for this student ID.' } : null)
    } catch (err) {
      setTickets([])
      setSelectedId(null)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load work orders' })
    } finally {
      setLoading(false)
    }
  }

  const updateLocalTicket = (updated: StudentWorkOrderTicket) => {
    setTickets((prev) => prev.map((ticket) => ticket.id === updated.id ? updated : ticket))
    setSelectedId(updated.id)
    setWorkPerformed(updated.workPerformed ?? '')
  }

  const saveWork = async () => {
    if (!selected || !searchedId) return
    setSaving(true)
    setMessage(null)
    try {
      const updated = await updateStudentWorkPerformed(searchedId, selected.id, workPerformed)
      updateLocalTicket(updated)
      setMessage({ type: 'success', text: 'Work performed saved.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save work performed' })
    } finally {
      setSaving(false)
    }
  }

  const submitCompleted = async () => {
    if (!selected || !searchedId) return
    setSaving(true)
    setMessage(null)
    try {
      const updated = await submitStudentWorkOrderCompleted(searchedId, selected.id, workPerformed)
      updateLocalTicket(updated)
      setMessage({ type: 'success', text: 'Work order submitted as completed. Your teacher will see it in the Work Orders dashboard.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit completed work order' })
    } finally {
      setSaving(false)
    }
  }

  const isClosed = selected?.status === 'submitted_completed' || selected?.status === 'completed' || selected?.status === 'cancelled'

  return (
    <div style={{ minHeight: '100vh', padding: '1rem', background: 'var(--gray-50)' }}>
      <div className="card" style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>Student Work Orders</h1>
            <p style={{ color: 'var(--gray-600)', marginBottom: 0 }}>
              Enter your student ID to view assigned work orders. You can only edit the work performed summary and submit your assignment as completed.
            </p>
          </div>
          <Link
            to="/"
            className="btn btn-secondary"
            aria-label="Back to sign-in screen"
            style={{ flexShrink: 0 }}
          >
            ← Back to Sign-In
          </Link>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); loadTickets() }} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
            <label>Student ID</label>
            <input className="input" type="number" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Enter your student ID" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !studentId.trim()}>{loading ? 'Loading…' : 'View Work Orders'}</button>
        </form>

        {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>}

        {tickets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.85fr) minmax(280px, 1.4fr)', gap: '1rem' }}>
            <section style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem', background: 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }}>
                <h2 style={{ fontSize: '1rem' }}>Assigned Tickets</h2>
              </div>
              {tickets.map((ticket) => (
                <button key={ticket.id} type="button" onClick={() => setSelectedId(ticket.id)} style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--gray-200)', background: selectedId === ticket.id ? '#eff6ff' : '#fff', textAlign: 'left', padding: '0.75rem', cursor: 'pointer' }}>
                  <strong>{ticket.title}</strong>
                  <div style={{ marginTop: '0.35rem' }}><span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{displayStatus(ticket.status)}</span></div>
                </button>
              ))}
            </section>

            <section style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '1rem' }}>
              {selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <h2>{selected.title}</h2>
                      <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>{selected.templateNameSnapshot} {selected.templateVersionSnapshot ? `— ${selected.templateVersionSnapshot}` : ''}</p>
                    </div>
                    <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{displayStatus(selected.status)}</span>
                  </div>

                  {selected.templatePhotoUrlSnapshot && (
                    <img src={selected.templatePhotoUrlSnapshot} alt={selected.templateNameSnapshot ?? selected.title} style={{ width: '100%', maxHeight: 240, objectFit: 'contain', border: '1px solid var(--gray-200)', borderRadius: 8, background: '#fff' }} />
                  )}

                  <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--gray-200)', padding: '1rem' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Assigned issue</h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{selected.issueDescription || selected.templateDescriptionSnapshot || 'No issue description.'}</p>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Work performed</label>
                    <textarea className="input" rows={7} value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} placeholder="Describe the work you performed" disabled={isClosed} />
                  </div>
                  {isClosed && <div className="alert alert-warning">This work order is no longer editable.</div>}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={saveWork} disabled={saving || isClosed}>{saving ? 'Saving…' : 'Save Work Performed'}</button>
                    <button className="btn btn-primary" onClick={submitCompleted} disabled={saving || isClosed}>{saving ? 'Submitting…' : 'Submit Completed'}</button>
                  </div>
                </div>
              ) : <p style={{ color: 'var(--gray-500)' }}>Select a ticket.</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
