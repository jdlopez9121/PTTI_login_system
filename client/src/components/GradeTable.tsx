import { useState } from 'react'
import {
  updateGradeEntry,
  createGradeEntry,
  deleteGradeTemplate,
  type GradeDashboardData,
  type GradeTemplate,
} from '../api'
import { formatDisplayName } from '../utils/formatName'
import GradeTemplateManager from './GradeTemplateManager'

interface Props {
  data: GradeDashboardData
  onRefresh: () => void
}

type EditingCell = { studentDbId: string; templateId: string; value: string }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function gradeColor(total: number): string {
  if (total >= 90) return '#065f46'
  if (total >= 75) return '#1341a8'
  if (total >= 60) return '#92400e'
  return '#991b1b'
}

export default function GradeTable({ data, onRefresh }: Props) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const quizTemplates = data.templates.filter((t) => t.type === 'quiz')
  const projectTemplates = data.templates.filter((t) => t.type === 'project')

  const cellKey = (studentDbId: string, templateId: string) => `${studentDbId}:${templateId}`

  const startEdit = (studentDbId: string, templateId: string, currentScore: number | null) => {
    setEditingCell({
      studentDbId,
      templateId,
      value: currentScore !== null ? String(currentScore) : '',
    })
  }

  const saveEdit = async (studentDbId: string, templateId: string, rawValue: string) => {
    setEditingCell(null)
    const key = cellKey(studentDbId, templateId)
    const template = data.templates.find((t) => t.id === templateId)
    if (!template) return

    const score = rawValue.trim() === '' ? null : parseFloat(rawValue)
    if (score !== null && (isNaN(score) || score < 0 || score > Number(template.maxScore))) return

    const student = data.students.find((s) => s.studentDbId === studentDbId)
    const existing = student?.entries[templateId]

    setSaving((prev) => new Set(prev).add(key))
    try {
      if (existing) {
        await updateGradeEntry(existing.id, { score })
      } else {
        const newEntry = await createGradeEntry(templateId, studentDbId)
        await updateGradeEntry(newEntry.id, { score })
      }
      onRefresh()
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleVerify = async (studentDbId: string, templateId: string) => {
    const student = data.students.find((s) => s.studentDbId === studentDbId)
    const entry = student?.entries[templateId]
    if (!entry) return
    const key = cellKey(studentDbId, templateId)
    setSaving((prev) => new Set(prev).add(key))
    try {
      await updateGradeEntry(entry.id, { isVerified: !entry.isVerified })
      onRefresh()
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleDeleteTemplate = async (template: GradeTemplate) => {
    try {
      await deleteGradeTemplate(template.id)
      setDeleteConfirm(null)
      onRefresh()
    } catch {
      // no-op — user will see no change
    }
  }

  const renderScoreCell = (
    studentDbId: string,
    template: GradeTemplate,
    isProject: boolean
  ) => {
    const student = data.students.find((s) => s.studentDbId === studentDbId)!
    const entry = student.entries[template.id]
    const key = cellKey(studentDbId, template.id)
    const isSaving = saving.has(key)
    const isEditing = editingCell?.studentDbId === studentDbId && editingCell?.templateId === template.id

    if (isSaving) {
      return <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>saving…</span>
    }

    if (isEditing) {
      return (
        <input
          autoFocus
          type="number"
          min={0}
          max={Number(template.maxScore)}
          step="any"
          value={editingCell.value}
          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
          onBlur={() => saveEdit(studentDbId, template.id, editingCell.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit(studentDbId, template.id, editingCell.value)
            if (e.key === 'Escape') setEditingCell(null)
          }}
          style={{ width: 64, padding: '0.2rem 0.4rem', fontSize: '0.875rem', borderRadius: 4, border: '1px solid var(--blue)' }}
        />
      )
    }

    const scoreDisplay = entry?.score !== null && entry?.score !== undefined
      ? `${entry.score}/${template.maxScore}`
      : '—'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span
          onClick={() => startEdit(studentDbId, template.id, entry?.score ?? null)}
          style={{
            cursor: 'pointer', padding: '0.15rem 0.4rem', borderRadius: 4,
            background: 'var(--gray-100)', fontSize: '0.875rem',
            minWidth: 48, textAlign: 'center',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gray-300)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
          title="Click to edit"
        >
          {scoreDisplay}
        </span>
        {isProject && entry?.score !== null && entry?.score !== undefined && (
          <button
            onClick={() => handleVerify(studentDbId, template.id)}
            style={{
              fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 4, border: 'none',
              cursor: 'pointer',
              background: entry?.isVerified ? '#d1fae5' : '#fef3c7',
              color: entry?.isVerified ? '#065f46' : '#92400e',
              fontWeight: 600,
            }}
            title={entry?.isVerified ? 'Click to unverify' : 'Click to verify'}
          >
            {entry?.isVerified ? '✓ Verified' : 'Verify'}
          </button>
        )}
      </div>
    )
  }

  const cohortLabel = MONTHS[data.cohortStartMonth - 1]
  const trackLabel = data.track.charAt(0).toUpperCase() + data.track.slice(1)

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ marginRight: 'auto' }}>
          {data.subject} — {cohortLabel} Cohort
          <span className="badge badge-gray" style={{ marginLeft: '0.5rem', fontWeight: 400 }}>
            {trackLabel} Track
          </span>
          <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>
            {data.students.length} students
          </span>
        </h3>
        <button className="btn btn-secondary" onClick={() => setShowAddTemplate(true)}>
          + Add Quiz / Project
        </button>
        <button className="btn btn-secondary" onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>

      {/* Grade weights legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>
        <span>Attendance 10%</span>
        <span>•</span>
        <span>Quiz avg 15%</span>
        <span>•</span>
        <span>Project avg 75%</span>
        <span style={{ marginLeft: 'auto', color: 'var(--gray-400)', fontSize: '0.75rem' }}>
          Click a score to edit &nbsp;|&nbsp; Project scores require verification to count
        </span>
      </div>

      <div className="table-wrapper">
        <table style={{ minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap' }}>Student ID</th>
              <th style={{ whiteSpace: 'nowrap' }}>Name</th>
              <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>Attend %</th>
              {quizTemplates.map((t) => (
                <th key={t.id} style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    <span title={t.description ?? undefined}>{t.name}</span>
                    {deleteConfirm === t.id ? (
                      <>
                        <button
                          onClick={() => handleDeleteTemplate(t)}
                          style={{ fontSize: '0.7rem', padding: '0 0.3rem', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{ fontSize: '0.7rem', padding: '0 0.3rem', background: 'var(--gray-200)', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(t.id)}
                        style={{ fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}
                        title="Delete this quiz"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {projectTemplates.map((t) => (
                <th key={t.id} style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: 130 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                    <span
                      title={t.description ?? undefined}
                      style={{ fontSize: '0.75rem', background: '#ede9fe', color: '#5b21b6', padding: '0.1rem 0.35rem', borderRadius: 4 }}
                    >
                      P
                    </span>
                    <span title={t.description ?? undefined}>{t.name}</span>
                    {deleteConfirm === t.id ? (
                      <>
                        <button
                          onClick={() => handleDeleteTemplate(t)}
                          style={{ fontSize: '0.7rem', padding: '0 0.3rem', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{ fontSize: '0.7rem', padding: '0 0.3rem', background: 'var(--gray-200)', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(t.id)}
                        style={{ fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}
                        title="Delete this project"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>Total %</th>
            </tr>
          </thead>
          <tbody>
            {data.students.length === 0 ? (
              <tr>
                <td colSpan={4 + data.templates.length} style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '2rem' }}>
                  No students in this cohort
                </td>
              </tr>
            ) : (
              data.students.map((s) => (
                <tr key={s.studentDbId}>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.studentId}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDisplayName(s.fullName)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: s.attendancePct >= 80 ? 'var(--green)' : s.attendancePct >= 60 ? '#92400e' : 'var(--red)',
                      }}
                    >
                      {s.attendancePct}%
                    </span>
                  </td>
                  {quizTemplates.map((t) => (
                    <td key={t.id} style={{ textAlign: 'center' }}>
                      {renderScoreCell(s.studentDbId, t, false)}
                    </td>
                  ))}
                  {projectTemplates.map((t) => (
                    <td key={t.id} style={{ textAlign: 'center' }}>
                      {renderScoreCell(s.studentDbId, t, true)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 700, color: gradeColor(s.total) }}>
                    {s.total > 0 ? `${s.total}%` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddTemplate && (
        <GradeTemplateManager
          subject={data.subject}
          onClose={() => setShowAddTemplate(false)}
          onSaved={() => { setShowAddTemplate(false); onRefresh() }}
        />
      )}
    </div>
  )
}
