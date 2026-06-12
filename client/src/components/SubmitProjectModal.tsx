import { useState, useEffect } from 'react'
import { getProjectTemplates, submitProject } from '../api'

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

export default function SubmitProjectModal({ room, onClose }: Props) {
  const [studentId, setStudentId] = useState('')
  const [subject, setSubject] = useState(ROOM_SUBJECT_MAP[room] ?? SUBJECTS[0])
  const [templateId, setTemplateId] = useState('')
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null }[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!subject) return
    setLoadingTemplates(true)
    setTemplateId('')
    getProjectTemplates(subject)
      .then((t) => { setTemplates(t); setTemplateId(t[0]?.id ?? '') })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [subject])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId.trim()) { setError('Student ID is required'); return }
    if (!templateId) { setError('Select a project'); return }
    setLoading(true)
    setError('')
    try {
      const result = await submitProject({ studentId: studentId.trim(), subject, templateId })
      setSuccess(result.message)
      setTimeout(onClose, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Submit Project</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div className="alert alert-success" style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem' }}>
              ✓ {success}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>Closing automatically…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
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
            <div className="form-group">
              <label>Project</label>
              {loadingTemplates ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>Loading…</p>
              ) : templates.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>No projects available for {subject}</p>
              ) : (
                <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading || templates.length === 0 || loadingTemplates}>
                {loading ? 'Submitting…' : 'Submit Project'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
