import { useState } from 'react'
import { searchStudents, manualAttendance, SearchStudent } from '../api'
import { formatDisplayName } from '../utils/formatName'

const STATIC_ROOMS = ['PLC Room', 'AC Room', 'DC Room', 'MT/HT Room']

function localDateTimeString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

interface Props {
  defaultRoom: string
  onClose: () => void
  onSaved: () => void
}

export default function LoginStudentModal({ defaultRoom, onClose, onSaved }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchStudent[]>([])
  const [selected, setSelected] = useState<SearchStudent | null>(null)
  const [loginTime, setLoginTime] = useState(localDateTimeString)
  const [roomName, setRoomName] = useState(
    STATIC_ROOMS.includes(defaultRoom) ? defaultRoom : STATIC_ROOMS[0]
  )
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      const data = await searchStudents(query.trim())
      setResults(data)
      if (data.length === 0) setError('No students found')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    if (!selected) { setError('Please search and select a student first'); return }
    setSaving(true)
    setError('')
    try {
      await manualAttendance({ studentDbId: selected.id, loginTime, roomName })
      setSuccess(`${formatDisplayName(selected.fullName)} clocked in successfully.`)
      setTimeout(onSaved, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clock in student')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Clock In Student</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Step 1 — Search */}
        <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)', marginBottom: '0.75rem' }}>
          <strong>Step 1:</strong> Search and select the student
        </p>
        <div className="form-group">
          <label htmlFor="student-search">Search by ID or Name</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="student-search"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Type student ID or name…"
            />
            <button className="btn btn-secondary" onClick={handleSearch} disabled={searching}>
              {searching ? '…' : 'Search'}
            </button>
          </div>
        </div>

        {results.length > 0 && !selected && (
          <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 6, marginBottom: '1rem' }}>
            {results.map((s) => (
              <div
                key={s.id}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}
                onClick={() => { setSelected(s); setResults([]) }}
              >
                <strong>{formatDisplayName(s.fullName)}</strong>
                <span style={{ color: 'var(--gray-400)', marginLeft: '0.5rem', fontSize: '0.82rem' }}>#{s.studentId}</span>
              </div>
            ))}
          </div>
        )}

        {selected ? (
          <div style={{ background: '#d1fae5', borderRadius: 6, padding: '0.6rem 0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#065f46' }}>
              ✓ <strong>{formatDisplayName(selected.fullName)}</strong> — #{selected.studentId}
            </span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }} onClick={() => setSelected(null)}>×</button>
          </div>
        ) : (
          <div style={{ background: 'var(--gray-100)', borderRadius: 6, padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--gray-600)' }}>
            No student selected — search above and click a name
          </div>
        )}

        {/* Step 2 — Time and Room */}
        <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)', marginBottom: '0.75rem' }}>
          <strong>Step 2:</strong> Confirm date, time, and room
        </p>

        <div className="form-group">
          <label htmlFor="clock-in-time">Date & Time</label>
          <input
            id="clock-in-time"
            className="input"
            type="datetime-local"
            value={loginTime}
            onChange={(e) => setLoginTime(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="clock-in-room">Room</label>
          <select
            id="clock-in-room"
            className="input"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          >
            {STATIC_ROOMS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selected}>
            {saving ? 'Clocking in…' : 'Clock In'}
          </button>
        </div>
      </div>
    </div>
  )
}
