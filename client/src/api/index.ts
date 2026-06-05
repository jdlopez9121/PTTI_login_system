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

// Grades — types
export type GradeType = 'quiz' | 'project'

export type GradeTemplate = {
  id: string
  teacherId: string
  subject: string
  type: GradeType
  name: string
  description: string | null
  maxScore: number
  createdAt: string
}

export type GradeEntry = {
  id: string
  templateId: string
  studentId: string
  score: number | null
  isVerified: boolean
  submittedBy: string | null
  submittedAt: string | null
  verifiedById: string | null
  verifiedAt: string | null
  createdAt: string
}

export type GradeStudentRow = {
  studentDbId: string
  studentId: string
  fullName: string
  attendancePct: number
  total: number
  entries: Record<string, GradeEntry>
}

export type GradeDashboardData = {
  subject: string
  cohortStartMonth: number
  track: string
  templates: GradeTemplate[]
  students: GradeStudentRow[]
}

export type GradeCohort = { cohortStartMonth: number; track: string }

export type PublicProjectData = {
  subjects: string[]
  templates: { id: string; subject: string; name: string; description: string | null }[]
}

// Grades — API calls
export const getGradeCohorts = (subject: string) =>
  request<GradeCohort[]>(`/grades/cohorts?subject=${encodeURIComponent(subject)}`)

export const getGradeTemplates = (subject: string) =>
  request<GradeTemplate[]>(`/grades/templates?subject=${encodeURIComponent(subject)}`)

export const createGradeTemplate = (data: {
  subject: string
  type: GradeType
  name: string
  description?: string
  maxScore?: number
  batchAllCohorts?: boolean
}) => request<GradeTemplate>('/grades/templates', { method: 'POST', body: JSON.stringify(data) })

export const deleteGradeTemplate = (id: string) =>
  request<null>(`/grades/templates/${id}`, { method: 'DELETE' })

export const getGradeDashboard = (subject: string, cohortStartMonth: number, track: string) => {
  const params = new URLSearchParams({ subject, cohortStartMonth: String(cohortStartMonth), track })
  return request<GradeDashboardData>(`/grades/dashboard?${params}`)
}

export const updateGradeEntry = (entryId: string, data: { score?: number | null; isVerified?: boolean }) =>
  request<GradeEntry>(`/grades/entries/${entryId}`, { method: 'PUT', body: JSON.stringify(data) })

export const createGradeEntry = (templateId: string, studentDbId: string) =>
  request<GradeEntry>('/grades/entries', { method: 'POST', body: JSON.stringify({ templateId, studentDbId }) })

// Public (no auth)
export const getPublicProjects = (subject?: string) => {
  const qs = subject ? `?subject=${encodeURIComponent(subject)}` : ''
  return request<PublicProjectData>(`/grades/projects/public${qs}`)
}

export const submitProject = (studentId: string, templateId: string) =>
  request<GradeEntry>('/grades/projects/submit', {
    method: 'POST',
    body: JSON.stringify({ studentId, templateId }),
  })
