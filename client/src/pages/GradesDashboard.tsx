import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMe,
  getGradeCohorts,
  getGradeDashboard,
  logout,
  type Teacher,
  type GradeDashboardData,
  type GradeCohort,
} from '../api'
import GradeTable from '../components/GradeTable'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface SelectedCohort {
  subject: string
  cohortStartMonth: number
  track: string
}

export default function GradesDashboard() {
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [activeSubject, setActiveSubject] = useState<string>('')
  const [cohorts, setCohorts] = useState<GradeCohort[]>([])
  const [selected, setSelected] = useState<SelectedCohort | null>(null)
  const [gradeData, setGradeData] = useState<GradeDashboardData | null>(null)
  const [loadingCohorts, setLoadingCohorts] = useState(false)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getMe()
      .then((t) => {
        setTeacher(t)
        const first = t.subject1
        setActiveSubject(first)
      })
      .catch(() => navigate('/'))
  }, [navigate])

  useEffect(() => {
    if (!activeSubject) return
    setSelected(null)
    setGradeData(null)
    setCohorts([])
    setLoadingCohorts(true)
    setError('')
    getGradeCohorts(activeSubject)
      .then(setCohorts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cohorts'))
      .finally(() => setLoadingCohorts(false))
  }, [activeSubject])

  const loadGrades = useCallback(async (cohort: SelectedCohort) => {
    setLoadingGrades(true)
    setError('')
    try {
      const d = await getGradeDashboard(cohort.subject, cohort.cohortStartMonth, cohort.track)
      setGradeData(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grades')
    } finally {
      setLoadingGrades(false)
    }
  }, [])

  const handleSelectCohort = (cohort: GradeCohort) => {
    const sel = { subject: activeSubject, cohortStartMonth: cohort.cohortStartMonth, track: cohort.track }
    setSelected(sel)
    loadGrades(sel)
  }

  const handleRefresh = () => {
    if (selected) loadGrades(selected)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const subjects = teacher
    ? [teacher.subject1, teacher.subject2, teacher.subject3].filter((s): s is string => Boolean(s))
    : []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav className="nav">
        <span className="nav-title">
          PTTI Grades
          {teacher && (
            <span style={{ fontWeight: 400, marginLeft: '1rem', fontSize: '0.9rem' }}>
              {teacher.name}
            </span>
          )}
        </span>
        <div className="nav-actions">
          <button
            className="btn btn-secondary"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={() => navigate('/teacher')}
          >
            ← Attendance
          </button>
          <button
            className="btn btn-secondary"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={handleLogout}
          >
            Log Out
          </button>
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 220, flexShrink: 0, borderRight: '1px solid var(--gray-200)',
          background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto',
          padding: '1rem 0',
        }}>
          {/* Subject tabs */}
          <div style={{ padding: '0 0.75rem', marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.4rem' }}>
              Subject
            </p>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSubject(s)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '0.5rem 0.75rem', borderRadius: 6, border: 'none',
                  background: activeSubject === s ? '#dbeafe' : 'transparent',
                  color: activeSubject === s ? 'var(--blue)' : 'var(--gray-700)',
                  fontWeight: activeSubject === s ? 600 : 400,
                  fontSize: '0.875rem', cursor: 'pointer', marginBottom: '0.25rem',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '0.5rem 0' }} />

          {/* Cohort list */}
          <div style={{ padding: '0 0.75rem' }}>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', marginBottom: '0.4rem' }}>
              Cohorts
            </p>
            {loadingCohorts && (
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>Loading…</p>
            )}
            {!loadingCohorts && cohorts.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>No active cohorts</p>
            )}
            {cohorts.map((c) => {
              const isActive =
                selected?.cohortStartMonth === c.cohortStartMonth && selected?.track === c.track
              const label = `${MONTHS[c.cohortStartMonth - 1]} (${c.track})`
              return (
                <button
                  key={`${c.cohortStartMonth}-${c.track}`}
                  onClick={() => handleSelectCohort(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '0.45rem 0.75rem', borderRadius: 6, border: 'none',
                    background: isActive ? '#f0fdf4' : 'transparent',
                    color: isActive ? 'var(--green)' : 'var(--gray-700)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: '0.85rem', cursor: 'pointer', marginBottom: '0.2rem',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {!selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--gray-400)' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select a cohort from the sidebar</p>
                <p style={{ fontSize: '0.875rem' }}>
                  {cohorts.length === 0 && !loadingCohorts
                    ? `No active cohorts found for ${activeSubject}. Students may not be enrolled yet.`
                    : 'Choose a cohort to view and edit grades.'}
                </p>
              </div>
            </div>
          )}

          {selected && loadingGrades && (
            <p style={{ color: 'var(--gray-400)' }}>Loading grades…</p>
          )}

          {selected && !loadingGrades && gradeData && (
            <div className="card">
              <GradeTable data={gradeData} onRefresh={handleRefresh} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
