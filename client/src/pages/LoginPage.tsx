import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentLogin, login, getPresentStudents, PresentStudent } from '../api'
import { getRoomCookie, setRoomCookie } from '../utils/roomCookie'
import { formatDisplayName } from '../utils/formatName'
import SubmitProjectModal from '../components/SubmitProjectModal'
import ViewGradesModal from '../components/ViewGradesModal'

const STATIC_ROOMS = ['PLC Room', 'AC Room', 'DC Room', 'MT/HT Room']

const SCHEDULE_NOTE = [
  { shift: 'Morning',   start: '8:00 AM',  cutoff: '10:30 AM' },
  { shift: 'Afternoon', start: '11:30 AM', cutoff: '2:00 PM'  },
  { shift: 'Evening',   start: '3:00 PM',  cutoff: '5:30 PM'  },
  { shift: 'Night',     start: '6:30 PM',  cutoff: '9:30 PM'  },
]

type LoginMode = 'student' | 'teacher'


export default function LoginPage() {
  const navigate = useNavigate()
  const [selectedRoom, setSelectedRoom] = useState(() => getRoomCookie() ?? STATIC_ROOMS[0])
  const [loginMode, setLoginMode] = useState<LoginMode>('student')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [presentStudents, setPresentStudents] = useState<PresentStudent[]>([])
  const [presentShift, setPresentShift] = useState<string | null>(null)
  const [showSubmitProject, setShowSubmitProject] = useState(false)
  const [showViewGrades, setShowViewGrades] = useState(false)

  useEffect(() => {
    const saved = getRoomCookie()
    if (saved && STATIC_ROOMS.includes(saved)) setSelectedRoom(saved)
  }, [])

  const handleRoomChange = (name: string) => {
    setSelectedRoom(name)
    setRoomCookie(name)
  }

  const fetchPresent = useCallback(async (room: string) => {
    try {
      const result = await getPresentStudents(room)
      setPresentStudents(result.students)
      setPresentShift(result.shift)
    } catch {
      // Non-critical — keep stale list on transient errors
    }
  }, [])

  useEffect(() => {
    fetchPresent(selectedRoom)
    const interval = setInterval(() => fetchPresent(selectedRoom), 30_000)
    return () => clearInterval(interval)
  }, [selectedRoom, fetchPresent])

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim()) return
    setLoading(true)
    setMessage(null)
    try {
      const result = await studentLogin(identifier.trim(), selectedRoom)
      if (result.warning) {
        setMessage({
          type: 'warning',
          text: `Clocked in — ${formatDisplayName(result.studentName)}. ⚠️ ${result.warning}`,
        })
      } else {
        setMessage({
          type: 'success',
          text: `Welcome, ${formatDisplayName(result.studentName)}! Checked in for ${result.shift} shift in ${result.room}.`,
        })
      }
      setIdentifier('')
      fetchPresent(selectedRoom)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Login failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      await login(email, password)
      navigate('/teacher')
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Login failed' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '2rem 1rem',
      gap: '2rem',
      flexWrap: 'wrap',
    }}>
      {/* Left — sign-in form */}
      <div className="card" style={{ width: 'min(440px, 100%)', textAlign: 'center', flexShrink: 0 }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Attendance Log in</h1>
        <p style={{ color: 'var(--gray-600)', marginBottom: '1.25rem', fontWeight: 600, letterSpacing: '0.05em' }}>PTTI</p>

        {loginMode === 'student' && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '0.65rem 0.9rem', marginBottom: '1.25rem', textAlign: 'left',
          }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.35rem' }}>
              Clock-in windows (doors open 5 min before class):
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 1rem' }}>
              {SCHEDULE_NOTE.map((s) => (
                <p key={s.shift} style={{ fontSize: '0.75rem', color: '#374151', margin: 0 }}>
                  <strong>{s.shift}:</strong> {s.start} – {s.cutoff}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="room-select">Room</label>
          <select
            id="room-select"
            name="room"
            className="input"
            value={selectedRoom}
            onChange={(e) => handleRoomChange(e.target.value)}
          >
            {STATIC_ROOMS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="login-as">Login As</label>
          <select
            id="login-as"
            name="loginAs"
            className="input"
            value={loginMode}
            onChange={(e) => { setLoginMode(e.target.value as LoginMode); setMessage(null) }}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        {loginMode === 'student' ? (
          <form onSubmit={handleStudentLogin}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="identifier">Student ID</label>
              <input
                id="identifier"
                name="identifier"
                className="input"
                type="number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your student ID"
                autoFocus
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '0.65rem' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTeacherLogin}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@ptti.edu"
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '0.65rem' }}>
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>
        )}

        {message && (
          <div className={`alert alert-${message.type}`}>{message.text}</div>
        )}
      </div>

      {/* Right — currently signed-in students */}
      <div className="card" style={{ minWidth: 280, flex: 1, maxWidth: 480 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Currently Signed In</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>
          {selectedRoom}
          {presentShift && (
            <span style={{
              marginLeft: '0.5rem',
              background: '#dbeafe', color: '#1e40af',
              borderRadius: 4, padding: '0.1rem 0.45rem',
              fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize',
            }}>
              {presentShift}
            </span>
          )}
        </p>

        {presentStudents.length === 0 ? (
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
            No students signed in yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {presentStudents.map((s, i) => (
              <li key={s.studentId + s.loginTime} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: i < presentStudents.length - 1 ? '1px solid var(--gray-200, #e5e7eb)' : 'none',
                fontSize: '0.875rem',
              }}>
                <span style={{ fontWeight: 500 }}>{formatDisplayName(s.fullName)}</span>
              </li>
            ))}
          </ul>
        )}

        <p style={{ fontSize: '0.7rem', color: 'var(--gray-400, #9ca3af)', marginTop: '1rem', textAlign: 'right' }}>
          {presentStudents.length} student{presentStudents.length !== 1 ? 's' : ''}
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowSubmitProject(true)}
          >
            Submit Project
          </button>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowViewGrades(true)}
          >
            View Grades
          </button>
        </div>
      </div>

      {showSubmitProject && (
        <SubmitProjectModal room={selectedRoom} onClose={() => setShowSubmitProject(false)} />
      )}
      {showViewGrades && (
        <ViewGradesModal room={selectedRoom} onClose={() => setShowViewGrades(false)} />
      )}
    </div>
  )
}
