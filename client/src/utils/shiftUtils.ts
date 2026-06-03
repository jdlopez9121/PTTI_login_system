// Classify the current local time into a shift name.
// Runs in the browser so it always uses the user's local timezone.
export function classifyCurrentShift(): string | undefined {
  const now = new Date()
  const totalMin = now.getHours() * 60 + now.getMinutes()
  if (totalMin >= 7 * 60 + 55  && totalMin <= 11 * 60 + 25) return 'morning'
  if (totalMin >= 11 * 60 + 30 && totalMin <= 14 * 60 + 55) return 'afternoon'
  if (totalMin >= 15 * 60 + 0  && totalMin <= 18 * 60 + 24) return 'evening'
  if (totalMin >= 18 * 60 + 25 && totalMin <= 23 * 60 + 0)  return 'night'
  return undefined
}
