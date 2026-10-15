import type { GradeBreakdown } from '../api'

export default function MonthlyAttendance({ attendance }: { attendance: GradeBreakdown['attendance'] }) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const datePart = (type: string) => parts.find((part) => part.type === type)!.value
  const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`
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
        {attendance.days.map((day) => {
          const missed = !day.completed && day.date < today
          const status = day.completed ? 'Signed in' : missed ? 'Missed' : day.date === today ? 'No sign-in yet' : 'Upcoming'
          const background = day.completed ? '#dceade' : missed ? '#f1dedd' : 'var(--gray-50)'
          const borderColor = day.completed ? '#b8d0bc' : missed ? '#ddbdbb' : 'var(--gray-200)'
          const color = day.completed ? '#315c3b' : missed ? '#85413e' : 'var(--gray-600)'
          return (
          <div key={day.date} title={`${day.date}: ${status}`}
            aria-label={`${day.date}: ${status}`}
            style={{ textAlign: 'center', padding: '0.4rem', background, color, border: `1px solid ${borderColor}`, borderRadius: 4 }}>
            <span style={{ display: 'block', fontSize: '0.7rem' }}>{Number(day.date.slice(5, 7))}/{Number(day.date.slice(8, 10))}</span>
            <span>{day.completed ? '✓' : missed ? '×' : '—'}</span>
          </div>
          )
        })}
      </div>
    </section>
  )
}
