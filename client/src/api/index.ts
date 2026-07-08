const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
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
// Notifications
// ---------------------------------------------------------------------------
export type NotificationAudience = 'all' | 'subject' | 'shift' | 'room'
export type NotificationPriority = 'normal' | 'important' | 'urgent'
export type NotificationSource = 'manual' | 'calendar' | 'email'
export type TeacherNotification = {
  id: string
  title: string
  body: string
  audience: NotificationAudience
  subject: string | null
  shift: string | null
  roomName: string | null
  priority: NotificationPriority
  source: NotificationSource
  sourceExternalId: string | null
  sourceCalendarId: string | null
  sourceStartAt: string | null
  sourceEndAt: string | null
  startsAt: string
  expiresAt: string
  createdById: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export type CreateNotificationInput = {
  title: string
  body: string
  audience?: NotificationAudience
  subject?: string | null
  shift?: string | null
  roomName?: string | null
  priority?: NotificationPriority
}
export type ActiveNotificationFilters = {
  subject?: string
  shift?: string
  roomName?: string
}
export const getActiveNotifications = (filters: ActiveNotificationFilters = {}) => {
  const params = new URLSearchParams()
  if (filters.subject) params.set('subject', filters.subject)
  if (filters.shift) params.set('shift', filters.shift)
  if (filters.roomName) params.set('roomName', filters.roomName)
  const qs = params.toString()
  return request<TeacherNotification[]>(`/notifications/active${qs ? `?${qs}` : ''}`)
}
export const createNotification = (data: CreateNotificationInput) =>
  request<TeacherNotification>('/notifications', { method: 'POST', body: JSON.stringify(data) })
export const archiveNotification = (id: string) =>
  request<TeacherNotification>(`/notifications/${id}/archive`, { method: 'POST' })

// ---------------------------------------------------------------------------
// Work Orders
// ---------------------------------------------------------------------------
export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'submitted_completed' | 'completed' | 'cancelled'
export type WorkOrderAssigneeType = 'student' | 'teacher' | null
export type WorkOrderMessageVisibility = 'teacher_only'
export type WorkOrderTemplate = {
  id: string
  name: string
  versionLabel: string | null
  description: string | null
  photoUrl: string | null
  photoPath?: string | null
  photoMimeType?: string | null
  photoSizeBytes?: number | null
  originalFilename?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
export type WorkOrderAssignees = {
  students: { id: string; studentId: string; fullName: string }[]
  teachers: { id: string; name: string; email: string }[]
}
export type WorkOrderAssigneeSearchOptions = {
  currentClassOnly?: boolean
  date?: string
  shift?: string
}
export type WorkOrderMessage = {
  id: string
  body: string
  visibility: WorkOrderMessageVisibility
  createdAt: string
  teacher?: { id: string; name: string } | null
}
export type WorkOrderTicket = {
  id: string
  templateId: string | null
  title: string
  issueDescription: string | null
  workPerformed: string | null
  templateNameSnapshot: string | null
  templateDescriptionSnapshot: string | null
  templatePhotoPathSnapshot?: string | null
  templatePhotoUrlSnapshot: string | null
  templatePhotoMimeTypeSnapshot?: string | null
  templatePhotoSizeBytesSnapshot?: number | null
  templateVersionSnapshot: string | null
  status: WorkOrderStatus
  assigneeType: WorkOrderAssigneeType
  assigneeStudentId?: string | null
  assigneeTeacherId?: string | null
  assigneeStudent?: { id: string; studentId: string; fullName: string } | null
  assigneeTeacher?: { id: string; name: string; email: string } | null
  createdBy?: { id: string; name: string; email: string } | null
  assignedAt?: string | null
  submittedCompletedAt?: string | null
  completedAt?: string | null
  archivedAt?: string | null
  archivedById?: string | null
  createdAt: string
  updatedAt: string
  messages?: WorkOrderMessage[]
}
export type WorkOrderNotification = {
  id: string
  ticketId: string
  teacherId: string
  type: 'submitted_completed' | 'completed'
  message: string
  readAt: string | null
  createdAt: string
  ticket?: { id: string; title: string; status: WorkOrderStatus } | null
}
export type WorkOrderWalkthroughVideoProvider = 'youtube' | 'vimeo' | 'embed'
export type WorkOrderWalkthroughVideo = {
  id: string
  teacherId: string
  title: string | null
  originalUrl: string
  embedUrl: string
  provider: WorkOrderWalkthroughVideoProvider
  createdAt: string
  updatedAt: string
}
export type StudentWorkOrderTicket = Pick<WorkOrderTicket,
  'id' | 'title' | 'issueDescription' | 'workPerformed' | 'templateNameSnapshot' |
  'templateDescriptionSnapshot' | 'templatePhotoPathSnapshot' | 'templatePhotoUrlSnapshot' |
  'templatePhotoMimeTypeSnapshot' | 'templatePhotoSizeBytesSnapshot' | 'templateVersionSnapshot' |
  'status' | 'assignedAt' | 'submittedCompletedAt' | 'completedAt' | 'createdAt' | 'updatedAt'
>

async function requestMultipart<T>(path: string, form: FormData, method = 'POST'): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, credentials: 'include', body: form })
  const body = await res.json().catch(() => ({ success: false, error: 'Unexpected server error' }))
  if (!body.success) throw new Error(body.error ?? 'Request failed')
  return body.data as T
}

export const getWorkOrderTemplates = () => request<WorkOrderTemplate[]>('/work-orders/templates')
export const createWorkOrderTemplate = (data: { name: string; versionLabel: string; description?: string; photo: File }) => {
  const form = new FormData()
  form.append('name', data.name)
  form.append('versionLabel', data.versionLabel)
  if (data.description) form.append('description', data.description)
  form.append('photo', data.photo)
  return requestMultipart<WorkOrderTemplate>('/work-orders/templates', form)
}
export const updateWorkOrderTemplate = (id: string, data: { name?: string; versionLabel?: string; description?: string; photo?: File | null }) => {
  const form = new FormData()
  if (data.name !== undefined) form.append('name', data.name)
  if (data.versionLabel !== undefined) form.append('versionLabel', data.versionLabel)
  if (data.description !== undefined) form.append('description', data.description)
  if (data.photo) form.append('photo', data.photo)
  return requestMultipart<WorkOrderTemplate>(`/work-orders/templates/${id}`, form, 'PUT')
}
export const deleteWorkOrderTemplate = (id: string) =>
  request<{ message: string }>(`/work-orders/templates/${id}`, { method: 'DELETE' })
export const searchWorkOrderAssignees = (q = '', options: WorkOrderAssigneeSearchOptions = {}) => {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (options.currentClassOnly) params.set('currentClassOnly', 'true')
  if (options.date) params.set('date', options.date)
  if (options.shift) params.set('shift', options.shift)
  const qs = params.toString()
  return request<WorkOrderAssignees>(`/work-orders/assignees${qs ? `?${qs}` : ''}`)
}
export const getWorkOrderTickets = (status?: WorkOrderStatus | '') =>
  request<WorkOrderTicket[]>(`/work-orders/tickets${status ? `?status=${status}` : ''}`)
export const getArchivedWorkOrderTickets = (status?: WorkOrderStatus | '') => {
  const params = new URLSearchParams({ archivedOnly: 'true' })
  if (status) params.set('status', status)
  return request<WorkOrderTicket[]>(`/work-orders/tickets?${params.toString()}`)
}
export const createWorkOrderTicket = (data: {
  templateId: string; title: string; issueDescription: string
  assigneeStudentId?: string; assigneeTeacherId?: string
}) => request<WorkOrderTicket>('/work-orders/tickets', { method: 'POST', body: JSON.stringify(data) })
export const createWorkOrderTicketsBatch = (data: {
  templateId: string; title: string; issueDescription: string; assigneeStudentIds: string[]
}) => request<{ tickets: WorkOrderTicket[]; created: number }>('/work-orders/tickets/batch', { method: 'POST', body: JSON.stringify(data) })
export const getWorkOrderTicket = (id: string) => request<WorkOrderTicket>(`/work-orders/tickets/${id}`)
export const updateWorkOrderTicket = (id: string, data: Partial<{
  title: string; issueDescription: string; workPerformed: string; status: WorkOrderStatus
  assigneeStudentId: string | null; assigneeTeacherId: string | null
}>) => request<WorkOrderTicket>(`/work-orders/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const cancelWorkOrderTicket = (id: string) =>
  request<WorkOrderTicket>(`/work-orders/tickets/${id}`, { method: 'DELETE' })
export const archiveWorkOrderTicket = (id: string) =>
  request<WorkOrderTicket>(`/work-orders/tickets/${id}/archive`, { method: 'POST' })
export const deleteWorkOrderTicket = (id: string) =>
  request<{ message: string }>(`/work-orders/tickets/${id}/permanent`, { method: 'DELETE' })
export const addWorkOrderMessage = (ticketId: string, body: string) =>
  request<WorkOrderMessage>(`/work-orders/tickets/${ticketId}/messages`, { method: 'POST', body: JSON.stringify({ body }) })
export const getWorkOrderNotifications = (unreadOnly = false) =>
  request<WorkOrderNotification[]>(`/work-orders/notifications${unreadOnly ? '?unreadOnly=true' : ''}`)
export const markWorkOrderNotificationRead = (id: string) =>
  request<WorkOrderNotification>(`/work-orders/notifications/${id}/read`, { method: 'POST' })
export const getWorkOrderWalkthroughVideos = () =>
  request<WorkOrderWalkthroughVideo[]>('/work-orders/walkthrough-videos')
export const createWorkOrderWalkthroughVideo = (data: { url: string; title?: string }) =>
  request<WorkOrderWalkthroughVideo>('/work-orders/walkthrough-videos', { method: 'POST', body: JSON.stringify(data) })
export const updateWorkOrderWalkthroughVideo = (id: string, data: { url?: string; title?: string }) =>
  request<WorkOrderWalkthroughVideo>(`/work-orders/walkthrough-videos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteWorkOrderWalkthroughVideo = (id: string) =>
  request<{ message: string }>(`/work-orders/walkthrough-videos/${id}`, { method: 'DELETE' })
export type WorkOrderStudentVideo = {
  id: string
  teacherId: string
  title: string | null
  originalUrl: string
  embedUrl: string
  provider: WorkOrderWalkthroughVideoProvider
  createdAt: string
  updatedAt: string
}

export const getWorkOrderStudentVideos = () =>
  request<WorkOrderStudentVideo[]>('/work-orders/student-walkthrough-videos')
export const createWorkOrderStudentVideo = (data: { url: string; title?: string }) =>
  request<WorkOrderStudentVideo>('/work-orders/student-walkthrough-videos', { method: 'POST', body: JSON.stringify(data) })
export const updateWorkOrderStudentVideo = (id: string, data: { url?: string; title?: string }) =>
  request<WorkOrderStudentVideo>(`/work-orders/student-walkthrough-videos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteWorkOrderStudentVideo = (id: string) =>
  request<{ message: string }>(`/work-orders/student-walkthrough-videos/${id}`, { method: 'DELETE' })

export const getStudentWorkOrderTickets = (studentId: string) =>
  request<StudentWorkOrderTicket[]>(`/work-orders/student/${encodeURIComponent(studentId)}/tickets`)
export const updateStudentWorkPerformed = (studentId: string, ticketId: string, workPerformed: string) =>
  request<StudentWorkOrderTicket>(`/work-orders/student/${encodeURIComponent(studentId)}/tickets/${ticketId}/work-performed`, {
    method: 'PATCH', body: JSON.stringify({ workPerformed }),
  })
export const submitStudentWorkOrderCompleted = (studentId: string, ticketId: string, workPerformed?: string) =>
  request<StudentWorkOrderTicket>(`/work-orders/student/${encodeURIComponent(studentId)}/tickets/${ticketId}/submit-completed`, {
    method: 'POST', body: JSON.stringify({ workPerformed }),
  })

export function workOrderPhotoSrc(url: string | null | undefined): string {
  if (!url) return ''
  return url.replace(/^\/uploads\/work-order-templates\//, '/api/work-orders/template-photos/')
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
export type ParsedQuizGradeRow = {
  rowNumber: number; firstName: string; lastName: string; fullName: string
  normalizedName: string; assignmentName: string; points: number; maxPoints: number; score: number
}
export type ImportableQuizGradeRow = ParsedQuizGradeRow & { studentDbId: string; studentId: string; studentName: string }
export type SkippedQuizGradeRow = { rowNumber: number; fullName: string; assignmentName: string; reason: string }
export type QuizGradeImportPreview = {
  rows: ParsedQuizGradeRow[]
  errors: string[]
  importable: ImportableQuizGradeRow[]
  skipped: SkippedQuizGradeRow[]
}
export type QuizGradeImportApplyResult = {
  imported: number
  createdOrUpdatedTemplates: string[]
  skipped: SkippedQuizGradeRow[]
  errors: string[]
  parseErrors: string[]
}

async function uploadQuizGradeSpreadsheet<T>(path: string, data: { file: File; subject: string; cohortMonth: number; cohortYear: number }): Promise<T> {
  const form = new FormData()
  form.append('file', data.file)
  form.append('subject', data.subject)
  form.append('cohortMonth', String(data.cohortMonth))
  form.append('cohortYear', String(data.cohortYear))
  const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form })
  const body = await res.json().catch(() => ({ success: false, error: 'Unexpected server error' }))
  if (!body.success) throw new Error(body.error ?? 'Import failed')
  return body.data as T
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
export const autoVerifySubmittedProjects = (data: { subject: string; cohortMonth: number; cohortYear: number; studentDbId?: string; studentDbIds?: string[] }) =>
  request<{ verifiedCount: number }>('/grades/entries/auto-verify', { method: 'POST', body: JSON.stringify(data) })

// Dashboard
export const getGradeDashboard = (subject: string, cohortMonth: number, cohortYear: number) =>
  request<GradeDashboard>(`/grades/dashboard?subject=${encodeURIComponent(subject)}&cohortMonth=${cohortMonth}&cohortYear=${cohortYear}`)
export const previewQuizGradeImport = (data: { file: File; subject: string; cohortMonth: number; cohortYear: number }) =>
  uploadQuizGradeSpreadsheet<QuizGradeImportPreview>('/grades/import/preview', data)
export const applyQuizGradeImport = (data: { file: File; subject: string; cohortMonth: number; cohortYear: number }) =>
  uploadQuizGradeSpreadsheet<QuizGradeImportApplyResult>('/grades/import/apply', data)

// Student kiosk
export const getProjectTemplates = (subject: string) =>
  request<{ id: string; name: string; description: string | null }[]>(`/grades/projects?subject=${encodeURIComponent(subject)}`)
export const submitProject = (data: { studentId: string; subject: string; templateId: string }) =>
  request<{ message: string; entryId: string }>('/grades/submit-project', { method: 'POST', body: JSON.stringify(data) })
export const getStudentGrades = (studentId: string, subject: string) =>
  request<GradeBreakdown & { studentId: string; fullName: string; subject: string; cohortMonth: number; cohortYear: number }>(
    `/grades/student/${encodeURIComponent(studentId)}?subject=${encodeURIComponent(subject)}`
  )
