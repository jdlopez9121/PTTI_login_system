import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSchoolWide, SchoolWideRow } from '../api'
import { classifyCurrentShift } from '../utils/shiftUtils'

const SHIFTS = ['morning', 'afternoon', 'evening', 'night']

export default function SchoolWideView() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SchoolWideRow[]>([])
  const [shift, setShift] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (s?: string) => {
    setLoading(true)
    setError('')
    // Use client local time when no shift is manually selected
    const resolved = s || classifyCurrentShift() || 'morning'
    try {
      const data = await getSchoolWide(resolved)
      setRows(data.rows)
      setShift(data.shift)
    } catch (err) {
      if (err instanceof Error && err.message.includes('authenticated')) navigate('/')
      else setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const currentShift = classifyCurrentShift() || 'morning'
    setShift(currentShift)
    load(currentShift)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPresent = rows.reduce((s, r) => s + r.present, 0)
  const totalEnrolled = rows.reduce((s, r) => s + r.total, 0)
  const overallPct = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="nav">
        <span className="nav-title">School-wide Attendance</span>
        <div className="nav-actions">
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={() => navigate('/teacher')}>
            ← Back to Dashboard
          </button>
        </div>
      </nav>

      <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label style={{ fontSize: '0.85rem' }}>Shift</label>
            <select className="input" value={shift} onChange={(e) => { setShift(e.target.value); load(e.target.value) }}>
              <option value="">Current</option>
              {SHIFTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => load(shift)} disabled={loading}
            style={{ alignSelf: 'flex-end' }}>
            ↻ Refresh
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>
              {shift.charAt(0).toUpperCase() + shift.slice(1)} Shift
            </h2>
            <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
              <div><strong>{totalPresent}</strong> / {totalEnrolled} present</div>
              <div style={{ color: overallPct >= 80 ? 'var(--green)' : overallPct >= 60 ? '#b45309' : 'var(--red)', fontWeight: 700 }}>
                {overallPct}% overall
              </div>
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Program Month</th>
                    <th style={{ textAlign: 'right' }}>Present</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)' }}>No data for this shift</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.subject}>
                      <td><strong>{r.subject}</strong></td>
                      <td>{r.programMonth}</td>
                      <td style={{ textAlign: 'right' }}>{r.present}</td>
                      <td style={{ textAlign: 'right' }}>{r.total}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`badge ${r.percentage >= 80 ? 'badge-green' : r.percentage >= 60 ? '' : ''}`}
                          style={r.percentage < 60 ? { background: '#fee2e2', color: '#991b1b' } : r.percentage < 80 ? { background: '#fef3c7', color: '#92400e' } : undefined}>
                          {r.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
