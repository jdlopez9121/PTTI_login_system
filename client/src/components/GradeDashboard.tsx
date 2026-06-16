import { useState, useEffect, useCallback } from 'react'
import {
  type GradeDashboard as GradeDashboardData,
  type GradeTemplate,
  type GradeType,
  getGradeDashboard,
  getTemplates,
  createTemplate,
  deleteTemplate,
  saveGradeEntry,
  verifyProjectEntry,
  previewQuizGradeImport,
  applyQuizGradeImport,
  type QuizGradeImportPreview,
  type QuizGradeImportApplyResult,
} from '../api'
import { formatDisplayName } from '../utils/formatName'

interface Props {
  teacherSubjects: string[]
  teacherShift: string
  onClose: () => void
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function GradeDashboard({ teacherSubjects, onClose }: Props) {
  const now = new Date()
  const [subject, setSubject] = useState(teacherSubjects[0] ?? '')
  const [cohortMonth, setCohortMonth] = useState(now.getMonth() + 1)
  const [cohortYear, setCohortYear] = useState(now.getFullYear())
  const [dashboard, setDashboard] = useState<GradeDashboardData | null>(null)
  const [templates, setTemplates] = useState<GradeTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [savingEntry, setSavingEntry] = useState<string | null>(null)
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})
  const [newTemplate, setNewTemplate] = useState<{ type: GradeType; name: string; description: string }>({ type: 'quiz', name: '', description: '' })
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<QuizGradeImportPreview | null>(null)
  const [importResult, setImportResult] = useState<QuizGradeImportApplyResult | null>(null)
  const [importing, setImporting] = useState(false)

  const loadData = useCallback(async () => {
    if (!subject) return
    setLoading(true)
    setError('')
    try {
      const [dash, tmpl] = await Promise.all([
        getGradeDashboard(subject, cohortMonth, cohortYear),
        getTemplates(subject),
      ])
      setDashboard(dash)
      setTemplates(tmpl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grades')
    } finally {
      setLoading(false)
    }
  }, [subject, cohortMonth, cohortYear])

  useEffect(() => { loadData() }, [loadData])

  const toggleRow = (dbId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(dbId) ? next.delete(dbId) : next.add(dbId)
      return next
    })

  const scoreKey = (templateId: string, studentDbId: string) => `${templateId}_${studentDbId}`

  const handleSaveScore = async (templateId: string, studentDbId: string) => {
    const key = scoreKey(templateId, studentDbId)
    const raw = scoreInputs[key]
    if (raw === undefined || raw === '') return
    const score = parseFloat(raw)
    if (isNaN(score) || score < 0 || score > 100) { setError('Score must be 0–100'); return }
    setSavingEntry(key)
    setError('')
    try {
      await saveGradeEntry({ templateId, studentDbId, score, cohortMonth, cohortYear })
      setScoreInputs((prev) => { const next = { ...prev }; delete next[key]; return next })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save score')
    } finally {
      setSavingEntry(null)
    }
  }

  const handleVerify = async (entryId: string, templateId: string, studentDbId: string) => {
    const key = scoreKey(templateId, studentDbId)
    const raw = scoreInputs[key]
    if (!raw) { setError('Enter a score before verifying'); return }
    const score = parseFloat(raw)
    if (isNaN(score) || score < 0 || score > 100) { setError('Score must be 0–100'); return }
    setSavingEntry(key)
    setError('')
    try {
      await verifyProjectEntry(entryId, score)
      setScoreInputs((prev) => { const next = { ...prev }; delete next[key]; return next })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify project')
    } finally {
      setSavingEntry(null)
    }
  }

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTemplate.name.trim()) return
    setAddingTemplate(true)
    setError('')
    try {
      await createTemplate({ subject, ...newTemplate })
      setNewTemplate({ type: 'quiz', name: '', description: '' })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add template')
    } finally {
      setAddingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    setError('')
    try {
      await deleteTemplate(id)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove template')
    }
  }

  const handlePreviewImport = async () => {
    if (!importFile) { setError('Choose an .xlsx quiz spreadsheet first'); return }
    setImporting(true)
    setError('')
    setImportResult(null)
    try {
      const preview = await previewQuizGradeImport({ file: importFile, subject, cohortMonth, cohortYear })
      setImportPreview(preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview quiz grades')
    } finally {
      setImporting(false)
    }
  }

  const handleApplyImport = async () => {
    if (!importFile) { setError('Choose an .xlsx quiz spreadsheet first'); return }
    setImporting(true)
    setError('')
    try {
      const result = await applyQuizGradeImport({ file: importFile, subject, cohortMonth, cohortYear })
      setImportResult(result)
      setImportPreview(null)
      setImportFile(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import quiz grades')
    } finally {
      setImporting(false)
    }
  }

  const quizTemplates = templates.filter((t) => t.type === 'quiz')
  const projectTemplates = templates.filter((t) => t.type === 'project')

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        style={{ width: 'min(1000px, 95vw)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <h2>Grade Dashboard</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 100 }}>
            <label style={{ fontSize: '0.78rem' }}>Subject</label>
            <select className="input" value={subject} onChange={(e) => { setSubject(e.target.value); setExpandedRows(new Set()) }}>
              {teacherSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.78rem' }}>Month</label>
            <select className="input" value={cohortMonth} onChange={(e) => setCohortMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.78rem' }}>Year</label>
            <input
              className="input"
              type="number"
              value={cohortYear}
              min={2024}
              max={2035}
              onChange={(e) => setCohortYear(parseInt(e.target.value))}
              style={{ width: 80 }}
            />
          </div>
          <button className="btn btn-primary" onClick={loadData} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowTemplateManager((v) => !v)}
          >
            {showTemplateManager ? 'Hide Templates' : 'Manage Templates'}
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <div style={{
          background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
          borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: '0.78rem' }}>Import quiz grades (.xlsx)</label>
              <input
                className="input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null)
                  setImportPreview(null)
                  setImportResult(null)
                }}
              />
            </div>
            <button className="btn btn-secondary" onClick={handlePreviewImport} disabled={importing || !importFile}>
              {importing ? 'Working…' : 'Preview'}
            </button>
            <button className="btn btn-primary" onClick={handleApplyImport} disabled={importing || !importPreview || importPreview.importable.length === 0}>
              Confirm Import
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.45rem' }}>
            Required columns: First Name, Last Name, Assignments, Points, Max Points. CSV files are not imported in this pass.
          </p>
          {importPreview && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.8rem' }}>
              <strong>{importPreview.importable.length}</strong> row{importPreview.importable.length !== 1 ? 's' : ''} ready ·{' '}
              <strong>{importPreview.skipped.length + importPreview.errors.length}</strong> issue{importPreview.skipped.length + importPreview.errors.length !== 1 ? 's' : ''}
              {importPreview.importable.slice(0, 5).map((row) => (
                <div key={`${row.rowNumber}-${row.studentDbId}-${row.assignmentName}`} style={{ color: 'var(--gray-600)' }}>
                  Row {row.rowNumber}: {formatDisplayName(row.studentName)} — {row.assignmentName} = {row.score}%
                </div>
              ))}
              {[...importPreview.errors, ...importPreview.skipped.map((row) => `Row ${row.rowNumber}: ${row.reason}`)].slice(0, 6).map((message) => (
                <div key={message} style={{ color: 'var(--red)' }}>{message}</div>
              ))}
              {(importPreview.importable.length > 5 || importPreview.errors.length + importPreview.skipped.length > 6) && (
                <div style={{ color: 'var(--gray-500)' }}>Additional rows omitted from preview.</div>
              )}
            </div>
          )}
          {importResult && (
            <div className="alert alert-success" style={{ marginTop: '0.6rem' }}>
              Imported {importResult.imported} quiz grade{importResult.imported !== 1 ? 's' : ''}. {importResult.skipped.length} row{importResult.skipped.length !== 1 ? 's were' : ' was'} skipped.
            </div>
          )}
        </div>

        {/* Template manager panel */}
        {showTemplateManager && (
          <div style={{
            background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
            borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', flexShrink: 0,
          }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Templates for {subject}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Quizzes</p>
                {quizTemplates.length === 0
                  ? <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>None added</p>
                  : quizTemplates.map((t) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--gray-200)' }}>
                      <span style={{ fontSize: '0.85rem' }}>{t.name}</span>
                      <button className="btn btn-secondary" style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: 'var(--red)' }} onClick={() => handleDeleteTemplate(t.id)}>Remove</button>
                    </div>
                  ))}
              </div>
              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Projects</p>
                {projectTemplates.length === 0
                  ? <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>None added</p>
                  : projectTemplates.map((t) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--gray-200)' }}>
                      <span style={{ fontSize: '0.85rem' }}>{t.name}</span>
                      <button className="btn btn-secondary" style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: 'var(--red)' }} onClick={() => handleDeleteTemplate(t.id)}>Remove</button>
                    </div>
                  ))}
              </div>
            </div>
            <form onSubmit={handleAddTemplate} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.75rem' }}>Type</label>
                <select className="input" value={newTemplate.type} onChange={(e) => setNewTemplate((p) => ({ ...p, type: e.target.value as GradeType }))}>
                  <option value="quiz">Quiz</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: '0.75rem' }}>Name</label>
                <input className="input" value={newTemplate.name} onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))} placeholder="Quiz 1" />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: '0.75rem' }}>Description (optional)</label>
                <input className="input" value={newTemplate.description} onChange={(e) => setNewTemplate((p) => ({ ...p, description: e.target.value }))} placeholder="Optional notes" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addingTemplate || !newTemplate.name.trim()}>
                {addingTemplate ? 'Adding…' : '+ Add'}
              </button>
            </form>
          </div>
        )}

        {/* Grade table — scrollable */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '2rem' }}>Loading…</p>
          ) : !dashboard || dashboard.students.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '2rem' }}>
              No students found for {subject} — {MONTHS[cohortMonth - 1]} {cohortYear}.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Attend % (10%)</th>
                  <th>Quiz % (15%)</th>
                  <th>Project % (75%)</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.students.map((student) => [
                  <tr
                    key={student.dbId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleRow(student.dbId)}
                  >
                    <td style={{ textAlign: 'center', userSelect: 'none', color: 'var(--gray-400)' }}>
                      {expandedRows.has(student.dbId) ? '▾' : '▸'}
                    </td>
                    <td>{student.studentId}</td>
                    <td>{formatDisplayName(student.fullName)}</td>
                    <td>
                      <span className={`badge ${student.attendance.percent >= 80 ? 'badge-green' : student.attendance.percent >= 60 ? 'badge-blue' : 'badge-gray'}`}>
                        {student.attendance.percent}% ({student.attendance.signIns}/{student.attendance.expectedDays})
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {student.quiz.percent}%
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {student.project.percent}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${student.total >= 75 ? 'badge-green' : student.total >= 60 ? 'badge-blue' : 'badge-gray'}`}>
                        {student.total}%
                      </span>
                    </td>
                  </tr>,

                  expandedRows.has(student.dbId) && (
                    <tr key={`${student.dbId}-detail`}>
                      <td colSpan={7} style={{ background: 'var(--gray-50)', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                          {/* Quiz scores */}
                          <div>
                            <p style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>Quizzes</p>
                            {student.quiz.entries.length === 0 ? (
                              <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>No quizzes configured</p>
                            ) : student.quiz.entries.map((entry) => {
                              const key = scoreKey(entry.templateId, student.dbId)
                              return (
                                <div key={entry.templateId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                  <span style={{ fontSize: '0.82rem', flex: 1 }}>{entry.name}</span>
                                  <input
                                    type="number" min={0} max={100}
                                    className="input"
                                    style={{ width: 65, padding: '0.2rem 0.35rem', fontSize: '0.82rem' }}
                                    value={scoreInputs[key] ?? (entry.score !== null ? String(entry.score) : '')}
                                    onChange={(e) => setScoreInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                                    placeholder={entry.score !== null ? String(entry.score) : '0–100'}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                                    disabled={savingEntry === key}
                                    onClick={(e) => { e.stopPropagation(); handleSaveScore(entry.templateId, student.dbId) }}
                                  >
                                    Save
                                  </button>
                                </div>
                              )
                            })}
                          </div>

                          {/* Project scores */}
                          <div>
                            <p style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>Projects</p>
                            {student.project.entries.length === 0 ? (
                              <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>No projects configured</p>
                            ) : student.project.entries.map((entry) => {
                              const key = scoreKey(entry.templateId, student.dbId)
                              const hasSubmission = Boolean(entry.submittedAt)
                              const isVerified = Boolean(entry.verifiedAt)
                              return (
                                <div key={entry.templateId} style={{ marginBottom: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.82rem', flex: 1 }}>{entry.name}</span>
                                    {isVerified ? (
                                      <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>✓ {entry.score}/100</span>
                                    ) : hasSubmission ? (
                                      <>
                                        <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>Submitted</span>
                                        <input
                                          type="number" min={0} max={100}
                                          className="input"
                                          style={{ width: 65, padding: '0.2rem 0.35rem', fontSize: '0.82rem' }}
                                          value={scoreInputs[key] ?? ''}
                                          onChange={(e) => setScoreInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                                          placeholder="Score"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <button
                                          className="btn btn-primary"
                                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                                          disabled={savingEntry === key}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (entry.entryId) handleVerify(entry.entryId, entry.templateId, student.dbId)
                                          }}
                                        >
                                          Verify
                                        </button>
                                      </>
                                    ) : (
                                      <span style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>Not submitted</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          )}
        </div>

        {dashboard && (
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', paddingTop: '0.5rem', textAlign: 'right' }}>
            {dashboard.students.length} student{dashboard.students.length !== 1 ? 's' : ''} · click a row to expand scores
          </p>
        )}
      </div>
    </div>
  )
}
