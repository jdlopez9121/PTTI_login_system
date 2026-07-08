import { useEffect, useState } from 'react'
import {
  type WorkOrderAssignees,
  type WorkOrderTemplate,
  type WorkOrderTicket,
  createWorkOrderTicket,
  createWorkOrderTicketsBatch,
  searchWorkOrderAssignees,
  workOrderPhotoSrc,
} from '../api'
import { formatDisplayName } from '../utils/formatName'

type Props = {
  templates: WorkOrderTemplate[]
  assigneeFilter?: { date?: string; shift?: string }
  onClose: () => void
  onCreated: (tickets: WorkOrderTicket[]) => void
}

type StudentChoice = { type: 'student'; id: string; label: string }
type TeacherChoice = { type: 'teacher'; id: string; label: string }

export default function WorkOrderCreateModal({ templates, assigneeFilter, onClose, onCreated }: Props) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState(templates[0]?.name ?? '')
  const [issueDescription, setIssueDescription] = useState(templates[0]?.description ?? '')
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [assignees, setAssignees] = useState<WorkOrderAssignees>({ students: [], teachers: [] })
  const [selectedStudents, setSelectedStudents] = useState<StudentChoice[]>([])
  const [teacherChoice, setTeacherChoice] = useState<TeacherChoice | null>(null)
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
        const data = await searchWorkOrderAssignees(assigneeQuery.trim(), {
          currentClassOnly: true,
          date: assigneeFilter?.date,
          shift: assigneeFilter?.shift,
        })
        if (!cancelled) setAssignees(data)
      } catch {
        if (!cancelled) setAssignees({ students: [], teachers: [] })
      } finally {
        if (!cancelled) setLoadingAssignees(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [assigneeFilter?.date, assigneeFilter?.shift, assigneeQuery])

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const canSave = Boolean(templateId && title.trim() && issueDescription.trim() && (selectedStudents.length > 0 || teacherChoice))

  const toggleStudent = (student: { id: string; studentId: string; fullName: string }) => {
    const nextChoice: StudentChoice = { type: 'student', id: student.id, label: `${formatDisplayName(student.fullName)} (${student.studentId})` }
    setTeacherChoice(null)
    setSelectedStudents((prev) => (
      prev.some((item) => item.id === student.id)
        ? prev.filter((item) => item.id !== student.id)
        : [...prev, nextChoice]
    ))
  }

  const selectTeacher = (teacher: { id: string; name: string; email: string }) => {
    setSelectedStudents([])
    setTeacherChoice({ type: 'teacher', id: teacher.id, label: `${teacher.name} (${teacher.email})` })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      if (selectedStudents.length > 1) {
        const result = await createWorkOrderTicketsBatch({
          templateId,
          title: title.trim(),
          issueDescription: issueDescription.trim(),
          assigneeStudentIds: selectedStudents.map((student) => student.id),
        })
        onCreated(result.tickets)
        return
      }

      const ticket = await createWorkOrderTicket({
        templateId,
        title: title.trim(),
        issueDescription: issueDescription.trim(),
        assigneeStudentId: selectedStudents[0]?.id,
        assigneeTeacherId: teacherChoice?.id,
      })
      onCreated([ticket])
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
              <label>Assign to current-class students or a teacher</label>
              <input className="input" value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} placeholder="Search current class students, teacher name, or email" />
            </div>
            {(selectedStudents.length > 0 || teacherChoice) && (
              <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
                {selectedStudents.length > 0
                  ? `${selectedStudents.length} student${selectedStudents.length !== 1 ? 's' : ''} selected`
                  : `Assigned to ${teacherChoice?.label}`}
                <button className="btn btn-secondary" type="button" onClick={() => { setSelectedStudents([]); setTeacherChoice(null) }} style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem' }}>clear</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.4rem' }}>Current Class Students</h3>
                {loadingAssignees ? <p style={{ color: 'var(--gray-400)' }}>Searching...</p> : assignees.students.length === 0 ? (
                  <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>No current-class students match.</p>
                ) : assignees.students.slice(0, 12).map((student) => {
                  const selected = selectedStudents.some((item) => item.id === student.id)
                  return (
                    <button
                      key={student.id}
                      type="button"
                      className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => toggleStudent(student)}
                      style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem' }}
                    >
                      <span>{formatDisplayName(student.fullName)}</span><span>{selected ? 'Selected' : student.studentId}</span>
                    </button>
                  )
                })}
              </div>
              <div>
                <h3 style={{ marginBottom: '0.4rem' }}>Teachers</h3>
                {loadingAssignees ? <p style={{ color: 'var(--gray-400)' }}>Searching...</p> : assignees.teachers.slice(0, 8).map((teacher) => (
                  <button key={teacher.id} type="button" className={`btn ${teacherChoice?.id === teacher.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectTeacher(teacher)} style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span>{teacher.name}</span><span style={{ fontSize: '0.7rem' }}>{teacher.email}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving || !canSave}>
                {saving ? 'Creating...' : selectedStudents.length > 1 ? `Create ${selectedStudents.length} Tickets` : 'Create Ticket'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
