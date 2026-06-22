import { useRef, useState } from 'react'
import { importCsv, ImportResult } from '../api'

interface Props {
  onImported: () => void | Promise<void>
}

export default function CsvImportButton({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const r = await importCsv(file)
      setResult(r)
      try {
        await onImported()
      } catch {
        // Import succeeded but refresh failed — stale data is acceptable
      }
    } catch (err) {
      setResult({ added: 0, skipped: 0, errors: [err instanceof Error ? err.message : 'Import failed'] })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => inputRef.current?.click()} disabled={loading}>
        {loading ? 'Importing…' : '↑ Import CSV'}
      </button>
      {result && (
        <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: result.errors.length ? 'var(--red)' : 'var(--green)' }}>
          {result.errors.length > 0
            ? result.errors[0]
            : `+${result.added} added, ${result.skipped} skipped`}
        </div>
      )}
    </div>
  )
}
