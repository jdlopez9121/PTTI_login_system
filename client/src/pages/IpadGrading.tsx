import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../api'
import { getIpadGrading, completeIpadProject, type IpadGradingData } from '../api/ipadGrading'
import { formatDisplayName } from '../utils/formatName'
import './IpadGrading.css'

export default function IpadGrading() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<{ subject?: string; shift?: string; month?: number; year?: number }>({})
  const [data, setData] = useState<IpadGradingData | null>(null)
  const [studentId, setStudentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [acknowledgement, setAcknowledgement] = useState<{ name: string; project: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const savingRef = useRef(false)

  useEffect(() => { getMe().catch(() => navigate('/')) }, [navigate])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setData(null)
    setStudentId('')
    setProjectId('')
    getIpadGrading(filter).then(result => {
      if (cancelled) return
      setData(result)
      setProjectId(result.projects[0]?.id ?? '')
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load class') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filter])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const student = data?.students.find(s => s.id === studentId)
  const project = data?.projects.find(p => p.id === projectId)
  const completed = Boolean(data?.completed.some(e => e.studentId === studentId && e.templateId === projectId))
  async function complete() {
    if (!data || !student || !project || savingRef.current || completed || acknowledgement) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await completeIpadProject({ subject: data.subject, shift: data.shift, month: data.month, year: data.year, studentDbId: student.id, templateId: project.id })
      setData(previous => previous ? { ...previous, completed: [...previous.completed, { studentId: student.id, templateId: project.id }] } : previous)
      setAcknowledgement({ name: formatDisplayName(student.fullName), project: project.name })
      timer.current = setTimeout(() => setAcknowledgement(null), 2000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Grade was not saved. Please try again.') }
    finally { savingRef.current = false; setSaving(false) }
  }

  return (
    <main className="ipad-grading">
      <nav className="ipad-toolbar" aria-label="Grading controls">
        <button className="btn btn-secondary" onClick={() => navigate('/teacher')} disabled={saving}>Back</button>
        <label>Class
          <select className="input" aria-label="Class to grade" value={data ? `${data.subject}|${data.shift}` : ''} disabled={loading || saving}
            onChange={event => { const [subject, shift] = event.target.value.split('|'); setFilter({ subject, shift, month: data?.month, year: data?.year }) }}>
            {!data && <option value="">Choose class</option>}
            {data?.classes.map(c => <option key={`${c.subject}|${c.shift}`} value={`${c.subject}|${c.shift}`}>{c.subject} · {c.shift}</option>)}
          </select>
        </label>
        <label>Grading month
          <input className="input" type="month" aria-label="Grading month" disabled={loading || saving} value={data ? `${data.year}-${String(data.month).padStart(2, '0')}` : ''}
            onChange={event => { if (!event.target.value) return; const [year, month] = event.target.value.split('-').map(Number); setFilter({ subject: data?.subject, shift: data?.shift, month, year }) }} />
        </label>
      </nav>
      {error && <div className="alert alert-error" role="alert">{error}<button className="btn btn-secondary" onClick={() => setFilter({ ...filter })} disabled={saving}>Reload class</button></div>}
      {loading ? <p role="status">Loading class…</p> : data && (
        <div className="ipad-columns">
          <div className="ipad-students" role="group" aria-label="Students">
            {data.students.length === 0 && <p>No students scheduled for this class and month.</p>}
            {data.students.map(s => {
              const done = data.completed.some(e => e.studentId === s.id && e.templateId === projectId)
              return <button key={s.id} className={`ipad-student ${s.id === studentId ? 'selected' : ''}`} aria-pressed={s.id === studentId} disabled={saving}
                onClick={() => { setStudentId(s.id); setError('') }}>
                {formatDisplayName(s.fullName)}{done && <span className="ipad-done">✓ 100%</span>}
              </button>
            })}
          </div>
          <section className="ipad-projects" aria-labelledby="graded-project-heading">
            <h1 id="graded-project-heading">Graded Project</h1>
            {data.projects.length === 0 ? <p>No projects configured for this class. Add projects using Manage Templates.</p> : (
              <select className="input ipad-project-select" aria-label="Graded project" value={projectId} disabled={saving} onChange={event => { setProjectId(event.target.value); setError('') }}>
                {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {project && <p className="ipad-project-name">{project.name}</p>}
          </section>
          <section className="ipad-complete" aria-label="Complete project">
            <p className="ipad-selected-name">{student ? formatDisplayName(student.fullName) : 'Select a student'}</p>
            <button className="ipad-complete-button" disabled={!student || !project || saving || completed || Boolean(acknowledgement)} onClick={complete}>
              {saving ? 'Saving…' : completed ? '✓ Completed · 100%' : 'Completed project'}
            </button>
          </section>
        </div>
      )}
      {acknowledgement && <div className="ipad-acknowledgement" role="status" aria-live="polite">
        <span className="ipad-ack-check" aria-hidden="true">✓</span>
        <strong>Grade submitted</strong>
        <span>{acknowledgement.name}</span>
        <span>{acknowledgement.project} · 100%</span>
      </div>}
    </main>
  )
}
