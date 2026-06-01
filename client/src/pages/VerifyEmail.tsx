import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return }

    fetch(`/api/auth/verify/${token}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setStatus('success')
          setMessage(body.data.message)
          setTimeout(() => navigate('/'), 2500)
        } else {
          setStatus('error')
          setMessage(body.error ?? 'Verification failed')
        }
      })
      .catch(() => { setStatus('error'); setMessage('Network error') })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(380px, 95vw)', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '1rem' }}>Email Verification</h1>
        {status === 'loading' && <p>Verifying…</p>}
        {status === 'success' && <div className="alert alert-success">{message} Redirecting to login…</div>}
        {status === 'error' && <div className="alert alert-error">{message}</div>}
      </div>
    </div>
  )
}
