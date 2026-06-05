const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const body = await res.json()
  if (!body.success) throw new Error(body.error ?? 'Request failed')
  return body.data as T
}

export type Room = { id: string; name: string }
export type Teacher = {
  id: string; name: string; email: string
  subject1: string; subject2: string | null; subject3: string | null; shift: string
}
export type StudentResult = {
  logId?: string; studentId: string; fullName: string; cohortStartMonth: number; loginTime?: string; room?: string
}
export type DashboardData = {
  teacher: Teacher
  currentShift: string
  targetDate: string
  presentStudents: StudentResult[]
  theoreticalHeadcount: StudentResult[]
  theoreticalTotal: number
}
export type SearchStudent = {
  id: string; studentId: string; fullName: string; cohortStartMonth: number; track: string
}
export type ImportResult = { added: number; skipped: number; errors: string[] }
export type SchoolWideRow = { subject: string; programMonth: number; present: number; total: number; percentage: number }

// Rooms
export const getRooms = () => request<Room[]>('/rooms')
export const createRoom = (name: string) =>
  request<Room>('/rooms', { method: 'POST', body: JSON.stringify({ name }) })

// Auth
export const signup = (data: {
  name: string; email: string; password: string
  subject1: string; subject2?: string; shift: string
}) => request<{ id: string; email: string; message: string }>('/auth/signup', {
  method: 'POST', body: JSON.stringify(data),
})
export const login = (email: string, password: string) =>
  request<Teacher>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
export const addTeacher = (data: {
  name: string; email: string; password: string
  subject1: string; subject2?: string; subject3?: string; shift: string
}) => request<{ id: string; name: string; email: string }>('/auth/add-teacher', {
  method: 'POST', body: JSON.stringify(data),
})
export const deleteTeacher = (email: string) =>
  request<{ message: string }>('/auth/teacher', { method: 'DELETE', body: JSON.stringify({ email }) })
export const logout = () => request<{ message: string }>('/auth/logout', { method: 'POST' })
export const getMe = () => request<Teacher>('/auth/me')

// Student kiosk login
export const studentLogin = (identifier: string, roomName: string) =>
  request<{ logId: string; studentName: string; shift: string; room: string; hoursCredit: number; warning: string | null }>(
    '/student/login',
    { method: 'POST', body: JSON.stringify({ identifier, roomName, clientHour: new Date().getHours(), clientMinute: new Date().getMinutes() }) }
  )

// Teacher dashboard
export const getDashboard = (date?: string, shift?: string) => {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (shift) params.set('shift', shift)
  const qs = params.toString()
  return request<DashboardData>(`/teacher/dashboard${qs ? `?${qs}` : ''}`)
}

// Students
export const searchStudents = (q: string) =>
  request<SearchStudent[]>(`/students/search?q=${encodeURIComponent(q)}`)
export const addStudent = (data: {
  studentId: string; fullName: string; cohortStartMonth: number; track: string
}) => request('/students', { method: 'POST', body: JSON.stringify(data) })
export const manualAttendance = (data: {
  studentDbId: string; loginTime: string; roomName: string
}) => request('/students/attendance/manual', { method: 'POST', body: JSON.stringify(data) })

// Public kiosk: currently signed-in students for a room
export type PresentStudent = { studentId: string; fullName: string; loginTime: string }
export const getPresentStudents = (room: string) => {
  const now = new Date()
  return request<{ shift: string | null; room: string; students: PresentStudent[] }>(
    `/student/present?room=${encodeURIComponent(room)}&clientHour=${now.getHours()}&clientMinute=${now.getMinutes()}`
  )
}

// CSV import (multipart)
export async function importCsv(file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/students/import`, { method: 'POST', credentials: 'include', body: form })
  const body = await res.json()
  if (!body.success) throw new Error(body.error ?? 'Import failed')
  return body.data as ImportResult
}

// School-wide
export const getSchoolWide = (shift?: string) => {
  const qs = shift ? `?shift=${shift}` : ''
  return request<{ shift: string; rows: SchoolWideRow[] }>(`/school-wide${qs}`)
}
