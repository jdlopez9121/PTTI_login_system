import { useState } from 'react'
import { addStudent } from '../api'

interface Props {
  onClose: () => void
  onSaved: () => void
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function AddStudentModal({ onClose, onSaved }: Props) {
  const [studentId, setStudentId] = useState('')
  const [fullName, setFullName] = useState('')
  const [cohortStartMonth, setCohortStartMonth] = useState('')
  const [track, setTrack] = useState<'day' | 'night'>('day')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId.trim() || !fullName.trim() || !cohortStartMonth) {
      setError('All fields are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await addStudent({
        studentId: studentId.trim(),
        fullName: fullName.trim(),
        cohortStartMonth: parseInt(cohortStartMonth),
        track,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add student')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Student</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Student ID</label>
            <input className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. 2688" />
          </div>
          <div className="form-group">
            <label>Full Name <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(Last, First)</span></label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Smith, John" />
          </div>
          <div className="form-group">
            <label>Cohort Start Month</label>
            <select className="input" value={cohortStartMonth} onChange={(e) => setCohortStartMonth(e.target.value)}>
              <option value="">Select month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Track</label>
            <select className="input" value={track} onChange={(e) => setTrack(e.target.value as 'day' | 'night')}>
              <option value="day">Day (Morning / Afternoon)</option>
              <option value="night">Night (Evening / Night)</option>
            </select>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding…' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
