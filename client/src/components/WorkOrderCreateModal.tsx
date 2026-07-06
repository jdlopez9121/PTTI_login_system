import { useEffect, useState } from 'react'
import {
  type WorkOrderAssignees,
  type WorkOrderTemplate,
  type WorkOrderTicket,
  createWorkOrderTicket,
  searchWorkOrderAssignees,
  workOrderPhotoSrc,
} from '../api'
import { formatDisplayName } from '../utils/formatName'

type Props = {
  templates: WorkOrderTemplate[]
  onClose: () => void
  onCreated: (ticket: WorkOrderTicket) => void
}

type AssigneeChoice = { type: 'student'; id: string; label: string } | { type: 'teacher'; id: string; label: string }

export default function WorkOrderCreateModal({ templates, onClose, onCreated }: Props) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState(templates[0]?.name ?? '')
  const [issueDescription, setIssueDescription] = useState(templates[0]?.description ?? '')
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [assignees, setAssignees] = useState<WorkOrderAssignees>({ students: [], teachers: [] })
  const [choice, setChoice] = useState<AssigneeChoice | null>(null)
  const [loadingAssignees, setLoadingAssignees] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const template = templates.find((t) => t.id === templateId)
    if (template && !title.trim()) setTitle(template.name)
    if (template && !issueDescription.trim()) setIssueDescription(template.description ?? '')
  }, [templateId, templates, title, issueDescription])

  useEffect(() => {
    let cancelled = false
    setLoadingAssignees(true)
    const timer = setTimeout(async () => {
      try {
        const data = await searchWorkOrderAssignees(assigneeQuery.trim())
        if (!cancelled) setAssignees(data)
      } catch {
        if (!cancelled) setAssignees({ students: [], teachers: [] })
      } finally {
        if (!cancelled) setLoadingAssignees(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [assigneeQuery])

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const canSave = templateId && title.trim() && issueDescription.trim() && choice

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const ticket = await createWorkOrderTicket({
        templateId,
        title: title.trim(),
        issueDescription: issueDescription.trim(),
        assigneeStudentId: choice.type === 'student' ? choice.id : undefined,
        assigneeTeacherId: choice.type === 'teacher' ? choice.id : undefined,
      })
      onCreated(ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(760px, 96vw)' }}>
        <div className="modal-header">
          <h2>Create Work Order</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
        {templates.length === 0 ? (
          <div className="alert alert-warning">Add a work-order template before creating tickets.</div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Template</label>
              <select className="input" value={templateId} onChange={(e) => {
                const next = templates.find((t) => t.id === e.target.value)
                setTemplateId(e.target.value)
                if (next) { setTitle(next.name); setIssueDescription(next.description ?? '') }
              }}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name} {template.versionLabel ? `— ${template.versionLabel}` : ''}</option>
                ))}
              </select>
            </div>
            {selectedTemplate?.photoUrl && (
              <img src={workOrderPhotoSrc(selectedTemplate.photoUrl)} alt={selectedTemplate.name} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: '1rem' }} />
            )}
            <div className="form-group">
              <label>Ticket title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Issue description</label>
              <textarea className="input" rows={4} value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Assign to student or teacher</label>
              <input className="input" value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} placeholder="Search by student ID, student name, teacher name, or email" />
            </div>
            {choice && (
              <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
                Assigned to {choice.label} <button className="btn btn-secondary" type="button" onClick={() => setChoice(null)} style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem' }}>change</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.4rem' }}>Students</h3>
                {loadingAssignees ? <p style={{ color: 'var(--gray-400)' }}>Searching…</p> : assignees.students.slice(0, 8).map((student) => (
                  <button key={student.id} type="button" className="btn btn-secondary" onClick={() => setChoice({ type: 'student', id: student.id, label: `${formatDisplayName(student.fullName)} (${student.studentId})` })} style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span>{formatDisplayName(student.fullName)}</span><span>{student.studentId}</span>
                  </button>
                ))}
              </div>
              <div>
                <h3 style={{ marginBottom: '0.4rem' }}>Teachers</h3>
                {loadingAssignees ? <p style={{ color: 'var(--gray-400)' }}>Searching…</p> : assignees.teachers.slice(0, 8).map((teacher) => (
                  <button key={teacher.id} type="button" className="btn btn-secondary" onClick={() => setChoice({ type: 'teacher', id: teacher.id, label: `${teacher.name} (${teacher.email})` })} style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span>{teacher.name}</span><span style={{ fontSize: '0.7rem' }}>{teacher.email}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving || !canSave}>{saving ? 'Creating…' : 'Create Ticket'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
