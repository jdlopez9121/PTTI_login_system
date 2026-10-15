import { useEffect, useState } from 'react'
import { getGradeDashboard, type StudentGrade } from '../api'
import { formatDisplayName } from '../utils/formatName'

const TIERS = [
  { name: 'Outstanding', minimum: 90, range: '90–100%', background: '#dceade', color: '#315c3b' },
  { name: 'Strong', minimum: 80, range: '80–89%', background: '#e0e8f0', color: '#385775' },
  { name: 'Passing', minimum: 75, range: '75–79%', background: '#eee8d9', color: '#725f32' },
  { name: 'Needs Support', minimum: 0, range: 'Below 75%', background: '#f1dedd', color: '#85413e' },
]

export default function ClassPerformance({ subject, month, year, enrollmentMonth, enrollmentYear, onClose }: {
  subject: string; month: number; year: number; enrollmentMonth: number; enrollmentYear: number; onClose: () => void
}) {
  const [students, setStudents] = useState<StudentGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // Always load the class roster, even when opened from a single student's grades.
    getGradeDashboard(subject, month, year, undefined, { month: enrollmentMonth, year: enrollmentYear }).then((data) => {
      if (!cancelled) setStudents(data.students)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load class performance')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [subject, month, year, enrollmentMonth, enrollmentYear])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sorted = [...students].sort((a, b) => b.total - a.total || formatDisplayName(a.fullName).localeCompare(formatDisplayName(b.fullName)) || a.studentId.localeCompare(b.studentId))
  const ranked = sorted.map((student) => ({
    student,
    rank: sorted.findIndex((entry) => entry.total === student.total) + 1,
    tier: TIERS.findIndex((tier) => student.total >= tier.minimum),
  }))
  const average = students.length ? Math.round(students.reduce((sum, student) => sum + student.total, 0) / students.length) : 0

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="class-performance-title"
        style={{ width: 'min(760px, 95vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="modal-header">
          <h2 id="class-performance-title">Class Performance</h2>
          <button className="modal-close" aria-label="Close class performance" onClick={onClose} autoFocus>×</button>
        </div>
        <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{subject} · {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, 1))} {year}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Enrollment cohort: {enrollmentMonth}/{enrollmentYear} · Grading period: {month}/{year}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>
          Ranked by overall grade: attendance 10%, quizzes 15%, projects 75%. Equal scores share a rank. Grades reflect currently recorded work.
        </p>
        <div style={{ overflowY: 'auto', minHeight: 0 }} aria-live="polite">
          {loading ? <p>Loading class performance…</p> : error ? <div className="alert alert-error">{error}</div> : students.length === 0 ? (
            <p>No students found for this subject and month.</p>
          ) : <>
            <p style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{students.length} students · Class average: <strong>{average}%</strong> · Top score: <strong>{sorted[0].total}%</strong></p>
            {TIERS.map((tier, tierIndex) => {
              const entries = ranked.filter((entry) => entry.tier === tierIndex)
              return (
                <section key={tier.name} aria-label={`${tier.name} tier`} style={{ marginBottom: '1rem', border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                  <h3 style={{ background: tier.background, color: tier.color, padding: '0.65rem 0.8rem', fontSize: '0.95rem' }}>{tier.name} · {tier.range} <span style={{ fontWeight: 400 }}>({entries.length})</span></h3>
                  {entries.length === 0 ? <p style={{ padding: '0.65rem 0.8rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>No students in this tier yet.</p> : (
                    <div className="table-wrapper">
                      <table aria-label={`${tier.name} leaderboard`}>
                        <thead><tr><th>Rank</th><th>Student</th><th>Score</th></tr></thead>
                        <tbody>{entries.map(({ student, rank }) => (
                          <tr key={student.dbId}>
                            <td style={{ width: 65, fontWeight: 600 }}>#{rank}</td>
                            <td>{formatDisplayName(student.fullName)}<span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray-600)' }}>ID {student.studentId}</span></td>
                            <td style={{ fontWeight: 700, color: tier.color }}>{student.total}%</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              )
            })}
          </>}
        </div>
        <button className="btn btn-secondary" onClick={onClose} style={{ alignSelf: 'flex-end', marginTop: '1rem', flexShrink: 0 }}>Back to Grades</button>
      </div>
    </div>
  )
}
