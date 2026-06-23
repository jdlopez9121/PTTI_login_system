import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createVideo,
  deleteVideo,
  getMe,
  getVideos,
  reorderVideos,
  updateVideo,
  type VideoLink,
} from '../api'

const EMPTY_FORM = { title: '', videoUrl: '' }

export default function VideoDashboard() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<VideoLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isTeacher, setIsTeacher] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const activeVideo = useMemo(
    () => videos.find((video) => video.id === editingId) ?? null,
    [videos, editingId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const videoData = await getVideos()
      setVideos(videoData.videos)
      if (editingId && !videoData.videos.some((video) => video.id === editingId)) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setLoading(false)
    }

    try {
      await getMe()
      setIsTeacher(true)
    } catch {
      setIsTeacher(false)
    }
  }, [editingId])

  useEffect(() => {
    load()
  }, [load])

  const beginCreate = () => {
    setEditingId('__new__')
    setForm(EMPTY_FORM)
  }

  const beginEdit = (video: VideoLink) => {
    setEditingId(video.id)
    setForm({ title: video.title, videoUrl: video.videoUrl })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const save = async () => {
    if (!form.title.trim() || !form.videoUrl.trim()) {
      setError('Title and video URL are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingId === '__new__') {
        await createVideo({ title: form.title.trim(), videoUrl: form.videoUrl.trim(), displayOrder: videos.length })
      } else if (editingId) {
        await updateVideo(editingId, { title: form.title.trim(), videoUrl: form.videoUrl.trim() })
      }
      await load()
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save video')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (video: VideoLink) => {
    if (!window.confirm(`Delete "${video.title}"?`)) return
    setSaving(true)
    setError('')
    try {
      await deleteVideo(video.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete video')
    } finally {
      setSaving(false)
    }
  }

  const move = async (video: VideoLink, direction: -1 | 1) => {
    const index = videos.findIndex((item) => item.id === video.id)
    const target = index + direction
    if (target < 0 || target >= videos.length) return
    const next = [...videos]
    ;[next[index], next[target]] = [next[target], next[index]]
    setVideos(next)
    try {
      await reorderVideos(next.map((item, order) => ({ id: item.id, displayOrder: order })))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder videos')
      await load()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      <nav className="nav">
        <span className="nav-title">Video Dashboard</span>
        <div className="nav-actions">
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} onClick={() => navigate('/teacher')}>
            ← Dashboard
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem' }}>
        <div className="card video-dashboard-card">
          <div className="video-dashboard-header">
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>Embedded Videos</h2>
              <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>
                Students and teachers can view the video list. Teachers can edit it from the small button in the top-right corner.
              </p>
            </div>
            {isTeacher && (
              <button className="btn btn-secondary video-edit-toggle" onClick={() => (editingId ? cancelEdit() : beginCreate())}>
                {editingId ? 'Close Edit' : 'Edit'}
              </button>
            )}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {isTeacher && editingId && (
            <div className="video-editor">
              <h3 style={{ marginBottom: '0.75rem' }}>{editingId === '__new__' ? 'Add Video' : `Edit ${activeVideo?.title ?? 'Video'}`}</h3>
              <div className="form-group">
                <label>Title</label>
                <input className="input" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="Lesson title" />
              </div>
              <div className="form-group">
                <label>Video URL</label>
                <input className="input" value={form.videoUrl} onChange={(e) => setForm((current) => ({ ...current, videoUrl: e.target.value }))} placeholder="https://youtu.be/... or https://vimeo.com/..." />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Video'}</button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
          ) : videos.length === 0 ? (
            <p style={{ color: 'var(--gray-600)' }}>No videos have been posted yet.</p>
          ) : (
            <div className="video-list">
              {videos.map((video, index) => (
                <article key={video.id} className="video-item">
                  <div className="video-item-header">
                    <h3>{video.title}</h3>
                    {isTeacher && (
                      <div className="video-item-actions">
                        <button className="btn btn-secondary" onClick={() => move(video, -1)} disabled={saving || index === 0}>↑</button>
                        <button className="btn btn-secondary" onClick={() => move(video, 1)} disabled={saving || index === videos.length - 1}>↓</button>
                        <button className="btn btn-secondary" onClick={() => beginEdit(video)} disabled={saving}>Edit</button>
                        <button className="btn btn-danger" onClick={() => remove(video)} disabled={saving}>Delete</button>
                      </div>
                    )}
                  </div>
                  <div className="video-frame-wrap">
                    <iframe
                      title={video.title}
                      src={video.embedUrl}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <a href={video.videoUrl} target="_blank" rel="noreferrer" className="video-open-link">
                      Open original link
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
