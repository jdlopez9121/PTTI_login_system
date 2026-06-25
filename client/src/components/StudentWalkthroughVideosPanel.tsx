import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  type WorkOrderStudentVideo,
  createWorkOrderStudentVideo,
  deleteWorkOrderStudentVideo,
  getWorkOrderStudentVideos,
  updateWorkOrderStudentVideo,
} from '../api'

type FormState = { title: string; url: string }

const EMPTY_FORM: FormState = { title: '', url: '' }

export default function StudentWalkthroughVideosPanel() {
  const [videos, setVideos] = useState<WorkOrderStudentVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const loadVideos = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setVideos(await getWorkOrderStudentVideos())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student walkthrough videos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVideos() }, [loadVideos])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
  }

  const editVideo = (video: WorkOrderStudentVideo) => {
    setForm({ title: video.title ?? '', url: video.originalUrl })
    setEditingId(video.id)
    setShowForm(true)
    setMessage('')
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = { title: form.title.trim(), url: form.url.trim() }
      if (editingId) {
        const updated = await updateWorkOrderStudentVideo(editingId, payload)
        setVideos((prev) => prev.map((video) => video.id === updated.id ? updated : video))
        setMessage('Student walkthrough video updated.')
      } else {
        const created = await createWorkOrderStudentVideo(payload)
        setVideos((prev) => [created, ...prev])
        setMessage('Student walkthrough video added.')
      }
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save student walkthrough video')
    } finally {
      setSaving(false)
    }
  }

  const removeVideo = async (video: WorkOrderStudentVideo) => {
    if (!window.confirm(`Remove "${video.title || video.originalUrl}"?`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await deleteWorkOrderStudentVideo(video.id)
      setVideos((prev) => prev.filter((item) => item.id !== video.id))
      if (editingId === video.id) resetForm()
      setMessage('Student walkthrough video removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove student walkthrough video')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--gray-200)', background: '#f0fdf4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
          <div>
            <h3>Student Video Walkthroughs</h3>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.76rem', marginTop: '0.2rem' }}>
              Student-viewable embedded video links. Visible to students on their work order page.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setMessage(''); setError('') }}
            disabled={saving}
            style={{ padding: '0.42rem 0.65rem', whiteSpace: 'nowrap' }}
          >
            Add Video
          </button>
        </div>
      </div>

      <div style={{ padding: '0.75rem', overflow: 'auto', minHeight: 0 }}>
        {error && <div className="alert alert-error" style={{ marginTop: 0, marginBottom: '0.75rem' }}>{error}</div>}
        {message && <div className="alert alert-success" style={{ marginTop: 0, marginBottom: '0.75rem' }}>{message}</div>}

        {showForm && (
          <form onSubmit={submit} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', background: '#fff' }}>
            <h4 style={{ marginBottom: '0.75rem' }}>{editingId ? 'Edit Student Video' : 'Add Student Video'}</h4>
            <div className="form-group">
              <label>Title (optional)</label>
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Safety inspection walkthrough"
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label>Embed URL</label>
              <input
                className="input"
                type="url"
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://www.youtube.com/watch?v=..."
                required
                disabled={saving}
              />
              <small style={{ color: 'var(--gray-600)' }}>Accepted: YouTube, Vimeo, or http(s) URLs containing /embed/.</small>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="submit" disabled={saving || !form.url.trim()}>{saving ? 'Saving…' : editingId ? 'Save Video' : 'Add Video'}</button>
              <button className="btn btn-secondary" type="button" onClick={resetForm} disabled={saving}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <p style={{ color: 'var(--gray-400)' }}>Loading videos…</p>
        ) : videos.length === 0 ? (
          <p style={{ color: 'var(--gray-500)' }}>No student walkthrough videos saved yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {videos.map((video) => (
              <article key={video.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{ aspectRatio: '16 / 9', background: 'var(--gray-100)' }}>
                  <iframe
                    title={video.title || `Student walkthrough video ${video.id}`}
                    src={video.embedUrl}
                    style={{ width: '100%', height: '100%', border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div style={{ padding: '0.65rem' }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem' }}>{video.title || 'Untitled walkthrough'}</strong>
                  <a href={video.originalUrl} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'var(--gray-600)', fontSize: '0.74rem', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                    {video.originalUrl}
                  </a>
                  <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-secondary" type="button" onClick={() => editVideo(video)} disabled={saving} style={{ padding: '0.35rem 0.55rem' }}>Edit</button>
                    <button className="btn btn-danger" type="button" onClick={() => removeVideo(video)} disabled={saving} style={{ padding: '0.35rem 0.55rem' }}>Delete</button>
                    <span className="badge badge-gray" style={{ textTransform: 'capitalize' }}>{video.provider}</span>
                    <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontSize: '0.7rem' }}>Student visible</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
