import { useState } from 'react'
import {
  type WorkOrderTemplate,
  createWorkOrderTemplate,
  deleteWorkOrderTemplate,
  updateWorkOrderTemplate,
} from '../api'

type Props = {
  templates: WorkOrderTemplate[]
  onChanged: () => Promise<void> | void
}

const emptyForm = { name: '', versionLabel: 'Version 1', description: '', photo: null as File | null }

export default function WorkOrderTemplateManager({ templates, onChanged }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const reset = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.versionLabel.trim()) return
    if (!editingId && !form.photo) {
      setMessage({ type: 'error', text: 'Choose a template photo before adding a new template.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      if (editingId) {
        await updateWorkOrderTemplate(editingId, {
          name: form.name.trim(),
          versionLabel: form.versionLabel.trim(),
          description: form.description.trim(),
          photo: form.photo,
        })
      } else {
        await createWorkOrderTemplate({
          name: form.name.trim(),
          versionLabel: form.versionLabel.trim(),
          description: form.description.trim(),
          photo: form.photo!,
        })
      }
      reset()
      await onChanged()
      setMessage({ type: 'success', text: editingId ? 'Template updated.' : 'Template added.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save template' })
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (template: WorkOrderTemplate) => {
    setEditingId(template.id)
    setForm({
      name: template.name,
      versionLabel: template.versionLabel ?? 'Version 1',
      description: template.description ?? '',
      photo: null,
    })
    setMessage(null)
  }

  const archiveTemplate = async (id: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await deleteWorkOrderTemplate(id)
      if (editingId === id) reset()
      await onChanged()
      setMessage({ type: 'success', text: 'Template archived.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to archive template' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '1rem', background: 'var(--gray-50)' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Work Order Templates</h3>
      {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: '0.75rem' }}>{message.text}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {templates.length === 0 ? (
          <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>No active templates yet.</p>
        ) : templates.map((template) => (
          <div key={template.id} className="card" style={{ padding: '0.75rem', boxShadow: 'none', border: '1px solid var(--gray-200)' }}>
            {template.photoUrl && (
              <img src={template.photoUrl} alt={template.name} style={{ width: '100%', maxHeight: 130, objectFit: 'contain', borderRadius: 6, background: '#fff', marginBottom: '0.5rem' }} />
            )}
            <strong>{template.name}</strong>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.78rem', marginTop: '0.2rem' }}>{template.versionLabel ?? 'No version'}</p>
            {template.description && <p style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>{template.description}</p>}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" type="button" onClick={() => startEdit(template)} disabled={busy}>Edit</button>
              <button className="btn btn-secondary" type="button" onClick={() => archiveTemplate(template.id)} disabled={busy} style={{ color: 'var(--red)' }}>Archive</button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Power Off / Machine Did Not Start" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Version</label>
          <input className="input" value={form.versionLabel} onChange={(e) => setForm((p) => ({ ...p, versionLabel: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional issue guidance" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Photo {editingId ? '(optional replacement)' : ''}</label>
          <input className="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setForm((p) => ({ ...p, photo: e.target.files?.[0] ?? null }))} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim() || !form.versionLabel.trim()}>
          {busy ? 'Saving…' : editingId ? 'Update Template' : '+ Add Template'}
        </button>
        {editingId && <button className="btn btn-secondary" type="button" onClick={reset} disabled={busy}>Cancel Edit</button>}
      </form>
    </div>
  )
}
