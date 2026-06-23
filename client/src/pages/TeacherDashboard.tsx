import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard, logout, getMe, type DashboardData, type StudentResult } from '../api'
import { classifyCurrentShift } from '../utils/shiftUtils'
import { formatDisplayName } from '../utils/formatName'
import { getRoomCookie } from '../utils/roomCookie'
import AddStudentModal from '../components/AddStudentModal'
import LoginStudentModal from '../components/LoginStudentModal'
import CsvImportButton from '../components/CsvImportButton'
import AddTeacherModal from '../components/AddTeacherModal'
import GradeDashboard from '../components/GradeDashboard'

const SHIFTS = ['morning', 'afternoon', 'evening', 'night']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterShift, setFilterShift] = useState('')

  const [showAddStudent, setShowAddStudent] = useState(false)
  const [showLoginStudent, setShowLoginStudent] = useState(false)
  const [showAddTeacher, setShowAddTeacher] = useState(false)
  const [showGrades, setShowGrades] = useState(false)

  const room = getRoomCookie() ?? 'Unknown Room'

  const load = useCallback(async (dateOverride?: string, shiftOverride?: string) => {
    setLoading(true)
    setError('')
    try {
      const date = dateOverride ?? filterDate
      const shift = shiftOverride !== undefined ? (shiftOverride || undefined) : (filterShift || undefined)
      const d = await getDashboard(date, shift)
      setData(d)
    } catch (err) {
      if (err instanceof Error && err.message.includes('authenticated')) {
        navigate('/')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      }
    } finally {
      setLoading(false)
    }
  }, [filterDate, filterShift, navigate])

  useEffect(() => {
    getMe().catch(() => navigate('/'))
    const shift = classifyCurrentShift() ?? ''
    setFilterShift(shift)
    load(undefined, shift)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav className="nav">
        <span className="nav-title">
          PTTI Attendance
          {data && <span style={{ fontWeight: 400, marginLeft: '1rem', fontSize: '0.9rem' }}>
            {data.teacher.name} — {data.teacher.subject1} ({data.currentShift})
          </span>}
        </span>
        <div className="nav-actions">
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={() => navigate('/school-wide')}>
            School-wide View
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={() => setShowGrades(true)}>
            Grades
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </nav>

      <div className="split-layout">
        {/* Present Students */}
        <div className="split-panel">
          <div className="card">
            <h2 style={{ marginBottom: '0.75rem' }}>
              Present Students
              {data && <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>
                {data.presentStudents.length}
              </span>}
            </h2>
            {error && <div className="alert alert-error">{error}</div>}
            {loading ? (
              <p style={{ color: 'var(--gray-400)', padding: '1rem 0' }}>Loading…</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Cohort</th>
                      <th>Room</th>
                      {data?.currentShift === 'all' && <th>Shift</th>}
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      if (!data || data.presentStudents.length === 0) {
                        return <tr><td colSpan={data?.currentShift === 'all' ? 6 : 5} style={{ color: 'var(--gray-400)', textAlign: 'center' }}>No students logged in</td></tr>
                      }
                      const myIds = new Set(data.theoreticalHeadcount.map(s => s.studentId))
                      const sorted = [...data.presentStudents].sort((a, b) => {
                        return (myIds.has(a.studentId) ? 0 : 1) - (myIds.has(b.studentId) ? 0 : 1)
                      })
                      const firstOtherIdx = sorted.findIndex(s => !myIds.has(s.studentId))
                      const colSpan = data.currentShift === 'all' ? 6 : 5
                      return sorted.flatMap((s, i) => {
                        const isMine = myIds.has(s.studentId)
                        const dataRow = (
                          <tr key={s.logId ?? s.studentId} style={{ opacity: isMine ? 1 : 0.6 }}>
                            <td>{s.studentId}</td>
                            <td>{formatDisplayName(s.fullName)}</td>
                            <td>{s.cohortStartMonth ? MONTHS[s.cohortStartMonth - 1] : '—'}</td>
                            <td>{s.room}</td>
                            {data.currentShift === 'all' && (
                              <td><span className="badge badge-blue">{(s as StudentResult & { shift?: string }).shift ?? '—'}</span></td>
                            )}
                            <td>{s.loginTime ? new Date(s.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          </tr>
                        )
                        if (i === firstOtherIdx && firstOtherIdx > 0) {
                          return [
                            <tr key="other-divider">
                              <td colSpan={colSpan} style={{ fontSize: '0.7rem', color: 'var(--gray-400)', padding: '0.2rem 0.5rem', background: '#f9fafb', fontStyle: 'italic', textAlign: 'center' }}>
                                — other rooms —
                              </td>
                            </tr>,
                            dataRow,
                          ]
                        }
                        return [dataRow]
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Action Column */}
        <div className="action-col">
          <button className="btn btn-primary" onClick={() => {
            const today = new Date().toISOString().split('T')[0]
            const shift = classifyCurrentShift() ?? ''
            setFilterShift(shift)
            setFilterDate(today)
            load(today, shift)
          }} disabled={loading}>
            ↻ Refresh
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddStudent(true)}>
            + Add Student
          </button>
          <button className="btn btn-secondary" onClick={() => setShowLoginStudent(true)}>
            ✎ Clock In Student
          </button>
          <CsvImportButton onImported={load} />
          <button className="btn btn-secondary" onClick={() => setShowAddTeacher(true)}>
            + Add Teacher
          </button>
          <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '0.25rem 0' }} />
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.78rem' }}>Date</label>
            <input className="input" type="date" value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.78rem' }}>Shift</label>
            <select className="input" value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
              <option value="">Current</option>
              <option value="all">All Shifts</option>
              {SHIFTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => load()} disabled={loading} style={{ marginTop: '0.25rem' }}>
            Apply Filter
          </button>
        </div>

        {/* Theoretical Head Count */}
        <div className="split-panel">
          <div className="card">
            <h2 style={{ marginBottom: '0.75rem' }}>
              Theoretical Head Count
              {data && <span className="badge badge-gray" style={{ marginLeft: '0.5rem' }}>
                {data.theoreticalTotal}
              </span>}
            </h2>
            {loading ? (
              <p style={{ color: 'var(--gray-400)', padding: '1rem 0' }}>Loading…</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Cohort</th>
                      <th>Present</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.theoreticalHeadcount.length === 0 ? (
                      <tr><td colSpan={4} style={{ color: 'var(--gray-400)', textAlign: 'center' }}>No students expected</td></tr>
                    ) : data?.theoreticalHeadcount.map((s) => {
                      const isPresent = data.presentStudents.some((p) => p.studentId === s.studentId)
                      return (
                        <tr key={s.studentId}>
                          <td>{s.studentId}</td>
                          <td>{formatDisplayName(s.fullName)}</td>
                          <td>{s.cohortStartMonth ? MONTHS[s.cohortStartMonth - 1] : '—'}</td>
                          <td>
                            <span className={`badge ${isPresent ? 'badge-green' : 'badge-gray'}`}>
                              {isPresent ? '✓' : '—'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddStudent && (
        <AddStudentModal
          onClose={() => setShowAddStudent(false)}
          onSaved={() => { setShowAddStudent(false); load() }}
        />
      )}

      {showLoginStudent && (
        <LoginStudentModal
          defaultRoom={room}
          onClose={() => setShowLoginStudent(false)}
          onSaved={() => { setShowLoginStudent(false); load() }}
        />
      )}

      {showAddTeacher && (
        <AddTeacherModal
          onClose={() => setShowAddTeacher(false)}
          onSaved={() => setShowAddTeacher(false)}
        />
      )}

      {showGrades && data && (
        <GradeDashboard
          teacherSubjects={[data.teacher.subject1, data.teacher.subject2, data.teacher.subject3].filter((s): s is string => Boolean(s))}
          teacherShift={data.teacher.shift}
          onClose={() => setShowGrades(false)}
        />
      )}

    </div>
  )
}
