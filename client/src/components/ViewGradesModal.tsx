import { useState, useEffect, useRef, useCallback } from 'react'
import { getStudentGrades } from '../api'
import MonthlyAttendance from './MonthlyAttendance'

interface Props {
  room: string
  onClose: () => void
}

const SUBJECTS = ['PLC 1','PLC 2','DC 1','DC 2','AC 1','AC 2','MT','HT']

const ROOM_SUBJECT_MAP: Record<string, string> = {
  'PLC Room': 'PLC 1',
  'AC Room': 'AC 1',
  'DC Room': 'DC 1',
  'MT/HT Room': 'MT',
}

type GradeData = Awaited<ReturnType<typeof getStudentGrades>>

const COUNTDOWN_SECONDS = 30

export default function ViewGradesModal({ room, onClose }: Props) {
  const [studentId, setStudentId] = useState('')
  const [subject, setSubject] = useState(ROOM_SUBJECT_MAP[room] ?? SUBJECTS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<GradeData | null>(null)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { onClose(); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [onClose])

  useEffect(() => {
    if (data) startCountdown()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [data, startCountdown])

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId.trim()) return
    setLoading(true)
    setError('')
    setData(null)
    try {
      const result = await getStudentGrades(studentId.trim(), subject)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch grades')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(520px, 95vw)' }}>
        <div className="modal-header">
          <h2>View Grades</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {!data ? (
          <form onSubmit={handleLookup}>
            <div className="form-group">
              <label>Student ID</label>
              <input
                className="input"
                type="number"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter your student ID"
                autoFocus
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label>Subject</label>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Looking up…' : 'View My Grades'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            {/* Student header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '1rem' }}>{data.fullName}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                  {data.subject} · ID {data.studentId}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span
                  className={`badge ${data.total >= 75 ? 'badge-green' : data.total >= 60 ? 'badge-blue' : 'badge-gray'}`}
                  style={{ fontSize: '1.1rem', padding: '0.3rem 0.85rem' }}
                >
                  {data.total}%
                </span>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: '0.2rem' }}>Overall</p>
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '0.65rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginBottom: '0.15rem' }}>Attendance</p>
                <p style={{ fontWeight: 700, fontSize: '1.15rem' }}>{data.attendance.percent}%</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>{data.attendance.signIns}/{data.attendance.expectedDays} days</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', marginTop: '0.15rem' }}>(10% weight)</p>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '0.65rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginBottom: '0.15rem' }}>Quizzes</p>
                <p style={{ fontWeight: 700, fontSize: '1.15rem' }}>{data.quiz.percent}%</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>{data.quiz.earned}/{data.quiz.possible} pts</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', marginTop: '0.15rem' }}>(15% weight)</p>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '0.65rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginBottom: '0.15rem' }}>Projects</p>
                <p style={{ fontWeight: 700, fontSize: '1.15rem' }}>{data.project.percent}%</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)' }}>{data.project.earned}/{data.project.possible} pts</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', marginTop: '0.15rem' }}>(75% weight)</p>
              </div>
            </div>

            <MonthlyAttendance attendance={data.attendance} />

            {/* Project submission status */}
            {data.project.entries.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>Project Status</p>
                {data.project.entries.map((entry) => (
                  <div
                    key={entry.templateId}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <span style={{ fontSize: '0.85rem' }}>{entry.name}</span>
                    {entry.verifiedAt ? (
                      <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>✓ Verified — {entry.score}/100</span>
                    ) : entry.submittedAt ? (
                      <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>Submitted — pending review</span>
                    ) : (
                      <span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>Not submitted</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer with countdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>
                Screen closes in {countdown}s
              </p>
              <button className="btn btn-secondary" onClick={onClose}>Close Now</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
