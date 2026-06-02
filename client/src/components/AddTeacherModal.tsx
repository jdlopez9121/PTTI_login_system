import { useState } from 'react'
import { addTeacher, deleteTeacher } from '../api'

interface Props {
  onClose: () => void
  onSaved: () => void
}

const SUBJECTS = ['PLC 1', 'PLC 2', 'PLC 3', 'DC 1', 'DC 2', 'DC 3', 'AC 1', 'AC 2', 'MT', 'HT']
const SHIFTS = ['morning', 'afternoon', 'evening', 'night']

export default function AddTeacherModal({ onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [subject1, setSubject1] = useState('')
  const [subject2, setSubject2] = useState('')
  const [subject3, setSubject3] = useState('')
  const [shift, setShift] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async () => {
    if (!deleteEmail.trim()) {
      setDeleteError('Enter the teacher email to delete')
      return
    }
    if (!window.confirm(`Permanently delete teacher "${deleteEmail}"? This cannot be undone.`)) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const result = await deleteTeacher(deleteEmail.trim())
      alert(result.message)
      onSaved()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete teacher')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password || !subject1 || !shift) {
      setError('Name, email, password, subject 1, and shift are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await addTeacher({
        name: name.trim(),
        email: email.trim(),
        password,
        subject1,
        subject2: subject2 || undefined,
        subject3: subject3 || undefined,
        shift,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add teacher')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Teacher</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@ptti.edu"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Subject 1 <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(required)</span></label>
            <select className="input" value={subject1} onChange={(e) => setSubject1(e.target.value)}>
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Subject 2 <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
            <select className="input" value={subject2} onChange={(e) => setSubject2(e.target.value)}>
              <option value="">None</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Subject 3 <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
            <select className="input" value={subject3} onChange={(e) => setSubject3(e.target.value)}>
              <option value="">None</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Shift</label>
            <select className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">Select shift</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding…' : 'Add Teacher'}
            </button>
          </div>
        </form>

        <hr style={{ margin: '1.25rem 0', border: 'none', borderTop: '1px solid var(--gray-200)' }} />

        <div>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--gray-700)' }}>Delete Teacher</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              type="email"
              placeholder="teacher@ptti.edu"
              value={deleteEmail}
              onChange={(e) => setDeleteEmail(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--red-600, #dc2626)', color: '#fff', whiteSpace: 'nowrap' }}
              disabled={deleteLoading}
              onClick={handleDelete}
            >
              {deleteLoading ? 'Deleting…' : 'Delete Teacher'}
            </button>
          </div>
          {deleteError && <div className="alert alert-error" style={{ marginTop: '0.5rem' }}>{deleteError}</div>}
        </div>
      </div>
    </div>
  )
}
