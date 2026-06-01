import { useState } from 'react'
import { addTeacher } from '../api'

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
      </div>
    </div>
  )
}
