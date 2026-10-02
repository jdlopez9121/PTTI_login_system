import type { GradeBreakdown } from '../api'

export default function MonthlyAttendance({ attendance }: { attendance: GradeBreakdown['attendance'] }) {
  return (
    <section style={{ marginBottom: '1rem' }} aria-label="Monthly attendance">
      <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
        {attendance.name} {attendance.year}: {attendance.signIns}/{attendance.expectedDays} completed — {attendance.percent}%
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
        Four weeks from the first Monday. Any sign-in that day earns a check mark.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.3rem' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
          <span key={day} style={{ textAlign: 'center', fontSize: '0.75rem' }}>{day}</span>
        ))}
        {attendance.days.map((day) => (
          <div key={day.date} title={`${day.date}: ${day.completed ? 'Completed' : 'No sign-in'}`}
            aria-label={`${day.date}: ${day.completed ? 'Completed' : 'No sign-in'}`}
            style={{ textAlign: 'center', padding: '0.4rem', border: '1px solid var(--gray-200)', borderRadius: 4 }}>
            <span style={{ display: 'block', fontSize: '0.7rem' }}>{Number(day.date.slice(5, 7))}/{Number(day.date.slice(8, 10))}</span>
            <span style={{ color: day.completed ? 'var(--green)' : 'var(--gray-400)' }}>{day.completed ? '✓' : '—'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
