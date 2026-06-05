import { useState, useEffect } from 'react'
import { getPublicProjects, submitProject } from '../api'

interface Props {
  onClose: () => void
}

export default function ProjectSubmitModal({ onClose }: Props) {
  const [subjects, setSubjects] = useState<string[]>([])
  const [allTemplates, setAllTemplates] = useState<{ id: string; subject: string; name: string; description: string | null }[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicProjects()
      .then((data) => {
        setSubjects(data.subjects)
        setAllTemplates(data.templates)
        if (data.subjects.length === 1) setSelectedSubject(data.subjects[0])
      })
      .catch(() => setError('Could not load project list'))
      .finally(() => setLoadingProjects(false))
  }, [])

  const projectsForSubject = allTemplates.filter((t) => t.subject === selectedSubject)

  const handleSubjectChange = (s: string) => {
    setSelectedSubject(s)
    setSelectedTemplateId('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId.trim()) { setError('Student ID is required'); return }
    if (!selectedSubject) { setError('Please select a class'); return }
    if (!selectedTemplateId) { setError('Please select a project'); return }

    setSubmitting(true)
    setError('')
    try {
      await submitProject(studentId.trim(), selectedTemplateId)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
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
          <div>
            <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
              Project submitted! Your teacher will verify it shortly.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => {
                setSuccess(false)
                setStudentId('')
                setSelectedTemplateId('')
                setSelectedSubject(subjects.length === 1 ? subjects[0] : '')
                setError('')
              }}>
                Submit Another
              </button>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {loadingProjects ? (
              <p style={{ color: 'var(--gray-400)', padding: '1rem 0', textAlign: 'center' }}>
                Loading projects…
              </p>
            ) : subjects.length === 0 ? (
              <p style={{ color: 'var(--gray-600)', padding: '1rem 0', textAlign: 'center' }}>
                No projects available for submission right now.
              </p>
            ) : (
              <>
                <div className="form-group">
                  <label>Class</label>
                  <select
                    className="input"
                    value={selectedSubject}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                  >
                    <option value="">Select class…</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Project</label>
                  <select
                    className="input"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={!selectedSubject || projectsForSubject.length === 0}
                  >
                    <option value="">
                      {!selectedSubject
                        ? 'Select a class first'
                        : projectsForSubject.length === 0
                        ? 'No projects for this class'
                        : 'Select project…'}
                    </option>
                    {projectsForSubject.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.description ? ` — ${t.description}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Student ID</label>
                  <input
                    className="input"
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="Enter your student ID"
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {subjects.length > 0 && (
                <button type="submit" className="btn btn-primary" disabled={submitting || loadingProjects}>
                  {submitting ? 'Submitting…' : 'Submit Project'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
