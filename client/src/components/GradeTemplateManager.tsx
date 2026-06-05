import { useState } from 'react'
import { createGradeTemplate, type GradeTemplate, type GradeType } from '../api'

interface Props {
  subject: string
  onClose: () => void
  onSaved: (template: GradeTemplate) => void
}

export default function GradeTemplateManager({ subject, onClose, onSaved }: Props) {
  const [type, setType] = useState<GradeType>('quiz')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [batchAllCohorts, setBatchAllCohorts] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    const max = parseFloat(maxScore)
    if (isNaN(max) || max <= 0) { setError('Max score must be a positive number'); return }

    setLoading(true)
    setError('')
    try {
      const template = await createGradeTemplate({
        subject,
        type,
        name: name.trim(),
        description: description.trim() || undefined,
        maxScore: max,
        batchAllCohorts,
      })
      onSaved(template)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Grade Item — {subject}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Type</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['quiz', 'project'] as GradeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: 6, border: '2px solid',
                    borderColor: type === t ? 'var(--blue)' : 'var(--gray-300)',
                    background: type === t ? '#dbeafe' : '#fff',
                    color: type === t ? 'var(--blue)' : 'var(--gray-700)',
                    fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'quiz' ? 'e.g. Quiz 1' : 'e.g. Final Project'}
            />
          </div>
          <div className="form-group">
            <label>Description <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
            />
          </div>
          <div className="form-group">
            <label>Max Score</label>
            <input
              className="input"
              type="number"
              min="1"
              step="any"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              id="batchCheck"
              checked={batchAllCohorts}
              onChange={(e) => setBatchAllCohorts(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="batchCheck" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
              Auto-add to all active cohorts for {subject}
            </label>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding…' : `Add ${type === 'quiz' ? 'Quiz' : 'Project'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
