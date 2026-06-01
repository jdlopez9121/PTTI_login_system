// Stored format: "LastName, FirstName" → display: "FirstName LastName"
export function formatDisplayName(raw: string): string {
  const commaIdx = raw.indexOf(',')
  if (commaIdx === -1) return raw
  const last = raw.slice(0, commaIdx).trim()
  const first = raw.slice(commaIdx + 1).trim()
  return `${first} ${last}`
}
