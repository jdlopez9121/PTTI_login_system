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
  logId?: string; studentId: string; fullName: string; cohortStartMonth: number; loginTime?: string; room?: string; shift?: string
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
export type VideoLink = {
  id: string
  title: string
  videoUrl: string
  embedUrl: string
  displayOrder: number
  createdAt: string
  updatedAt: string
  createdBy: Teacher
  updatedBy: Teacher | null
}

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

// Videos dashboard
export const getVideos = () => request<{ videos: VideoLink[] }>('/videos')
export const createVideo = (data: { title: string; videoUrl: string; displayOrder?: number }) =>
  request<{ video: VideoLink }>('/videos', { method: 'POST', body: JSON.stringify(data) })
export const updateVideo = (id: string, data: { title?: string; videoUrl?: string; displayOrder?: number }) =>
  request<{ video: VideoLink }>(`/videos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteVideo = (id: string) =>
  request<{ id: string }>(`/videos/${id}`, { method: 'DELETE' })
export const reorderVideos = (videos: { id: string; displayOrder: number }[]) =>
  request<{ videos: VideoLink[] }>('/videos/reorder', { method: 'PUT', body: JSON.stringify({ videos }) })

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
  const body = await res.json().catch(() => ({ success: false, error: 'Unexpected server error' }))
  if (!body.success) throw new Error(body.error ?? 'Import failed')
  return body.data as ImportResult
}

// School-wide
export const getSchoolWide = (shift?: string) => {
  const qs = shift ? `?shift=${shift}` : ''
  return request<{ shift: string; rows: SchoolWideRow[] }>(`/school-wide${qs}`)
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------
export type GradeType = 'quiz' | 'project'

export type GradeTemplate = {
  id: string; subject: string; type: GradeType
  name: string; description: string | null; order: number; isActive: boolean
}

export type QuizEntry    = { templateId: string; name: string; score: number | null }
export type ProjectEntry = {
  templateId: string; entryId: string; name: string; score: number | null
  submittedAt: string | null; verifiedAt: string | null
}
export type GradeBreakdown = {
  attendance: { signIns: number; expectedDays: number; percent: number }
  quiz:    { earned: number; possible: number; percent: number; entries: QuizEntry[] }
  project: { earned: number; possible: number; percent: number; entries: ProjectEntry[] }
  total: number
}
export type StudentGrade = GradeBreakdown & {
  studentId: string; fullName: string; dbId: string
}
export type GradeDashboard = {
  subject: string; cohortMonth: number; cohortYear: number; students: StudentGrade[]
}

// Templates
export const getTemplates = (subject: string) =>
  request<GradeTemplate[]>(`/grades/templates?subject=${encodeURIComponent(subject)}`)
export const createTemplate = (data: { subject: string; type: GradeType; name: string; description?: string; order?: number }) =>
  request<GradeTemplate>('/grades/templates', { method: 'POST', body: JSON.stringify(data) })
export const updateTemplate = (id: string, data: { name?: string; description?: string; order?: number }) =>
  request<GradeTemplate>(`/grades/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTemplate = (id: string) =>
  request<{ message: string }>(`/grades/templates/${id}`, { method: 'DELETE' })
export const batchCreateTemplates = (subject: string, templates: { type: GradeType; name: string; description?: string; order?: number }[]) =>
  request<GradeTemplate[]>('/grades/templates/batch', { method: 'POST', body: JSON.stringify({ subject, templates }) })

// Grade entries
export const saveGradeEntry = (data: { templateId: string; studentDbId: string; score: number; cohortMonth: number; cohortYear: number }) =>
  request('/grades/entries', { method: 'POST', body: JSON.stringify(data) })
export const verifyProjectEntry = (entryId: string, score: number) =>
  request(`/grades/entries/${entryId}/verify`, { method: 'POST', body: JSON.stringify({ score }) })

// Dashboard
export const getGradeDashboard = (subject: string, cohortMonth: number, cohortYear: number) =>
  request<GradeDashboard>(`/grades/dashboard?subject=${encodeURIComponent(subject)}&cohortMonth=${cohortMonth}&cohortYear=${cohortYear}`)

// Student kiosk
export const getProjectTemplates = (subject: string) =>
  request<{ id: string; name: string; description: string | null }[]>(`/grades/projects?subject=${encodeURIComponent(subject)}`)
export const submitProject = (data: { studentId: string; subject: string; templateId: string }) =>
  request<{ message: string; entryId: string }>('/grades/submit-project', { method: 'POST', body: JSON.stringify(data) })
export const getStudentGrades = (studentId: string, subject: string) =>
  request<GradeBreakdown & { studentId: string; fullName: string; subject: string; cohortMonth: number; cohortYear: number }>(
    `/grades/student/${encodeURIComponent(studentId)}?subject=${encodeURIComponent(subject)}`
  )
