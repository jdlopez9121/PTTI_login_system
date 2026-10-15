export type IpadClass = { subject: string; shift: string }
export type IpadGradingData = IpadClass & {
  month: number; year: number; classes: IpadClass[]
  students: { id: string; studentId: string; fullName: string }[]
  projects: { id: string; name: string }[]
  completed: { studentId: string; templateId: string }[]
}

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ipad-grading${path}`, { credentials: 'include', ...options })
  const body = await response.json()
  if (!response.ok || !body.success) throw new Error(body.error ?? 'Unable to load grading')
  return body.data
}

export const getIpadGrading = (params: Partial<IpadClass & { month: number; year: number }> = {}) =>
  call<IpadGradingData>(`?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`)

export const completeIpadProject = (data: IpadClass & { month: number; year: number; studentDbId: string; templateId: string }) =>
  call<{ score: number }>('/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
