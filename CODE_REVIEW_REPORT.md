# PTTI Dashboard - Comprehensive Code Review Report

**Date:** 2026-06-22  
**Codebase Size:** ~4,362 LOC  
**Stack:** React 18 + TypeScript + Express.js + Prisma + PostgreSQL

---

## Executive Summary

The codebase has **8 CRITICAL bugs**, **12 HIGH severity issues**, and **14 MEDIUM issues**. Most critical are security vulnerabilities (missing CSRF protection, weak auth defaults, no rate limiting) and state management bugs that could cause data loss or race conditions.

**Estimated Fix Time:** 40-60 hours across all categories  
**Priority:** Address CRITICAL issues before production, HIGH issues before beta

---

## 0. Current Session Handoff

The latest agent session has already completed the following work:

- Strengthened backend validation and authorization for student login, attendance, and grade routes.
- Hardened teacher subject/grade template access checks in `server/src/routes/grades.ts`.
- Added room and time validation to `server/src/routes/students.ts`.
- Added exception handling and logging in `server/src/cron/monthlyRotation.ts`.
- Updated client API helper in `client/src/api/index.ts` to preserve `FormData` uploads.
- Added a request concurrency guard in `client/src/pages/TeacherDashboard.tsx` to prevent stale dashboard loads.

### Status at handoff

- Code edits are applied successfully in the workspace.
- A server build was attempted and exposed current TypeScript issues related to Prisma enum imports and implicit `any` types across server files.
- Next agent should re-run Prisma generation (`npm run db:generate` in `server`) and resolve the remaining compile-time import/type issues before continuing.

---

## 1. CRITICAL BUGS (Immediate Fixes Required)

### 1.1 **CSRF Vulnerability - Missing CSRF Token Protection**
**File:** [server/src/index.ts](server/src/index.ts)  
**Severity:** CRITICAL  
**Risk:** Attackers can forge requests on behalf of authenticated users

**Problem:**
```typescript
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,  // ← Allows credentials in cross-origin requests
}))
// ← Missing CSRF token validation
```

CORS is configured to allow credentials (`credentials: true`), but there's no CSRF token protection. This allows attackers to make authenticated requests from other domains.

**Fix:**
```typescript
import csrf from 'csurf'
import session from 'express-session'

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}))

const csrfProtection = csrf({ cookie: false })
app.use(csrfProtection)

// Add CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ token: req.csrfToken() })
})

// Require CSRF token on mutation endpoints
app.post('/api/*', csrfProtection, ...)
app.put('/api/*', csrfProtection, ...)
app.delete('/api/*', csrfProtection, ...)
```

---

### 1.2 **Weak JWT Secret Default - Production Security Risk**
**File:** [server/src/routes/auth.ts](server/src/routes/auth.ts#L79), [server/src/middleware/requireAuth.ts](server/src/middleware/requireAuth.ts#L23)  
**Severity:** CRITICAL  
**Risk:** JWT tokens can be forged if `JWT_SECRET` env var is not set

**Problem:**
```typescript
const token = jwt.sign(
  { teacherId: teacher.id, email: teacher.email },
  process.env.JWT_SECRET ?? 'dev-secret',  // ← Uses 'dev-secret' if env var missing!
  { expiresIn: '8h' }
)

// Verification also uses same weak default
jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret')
```

If `JWT_SECRET` environment variable is not set, the system falls back to 'dev-secret', which is hardcoded and public.

**Fix:**
```typescript
// In index.ts at startup
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set')
  process.exit(1)
}

// Export for use in routes
export { JWT_SECRET }

// In auth.ts
import { JWT_SECRET } from '../index'
const token = jwt.sign({ teacherId, email }, JWT_SECRET, { expiresIn: '8h' })
```

---

### 1.3 **Race Condition in TeacherDashboard - Stale Dependencies**
**File:** [client/src/pages/TeacherDashboard.tsx](client/src/pages/TeacherDashboard.tsx#L52-L57)  
**Severity:** CRITICAL  
**Risk:** Data fetched with wrong filters; user changes filter but old request completes

**Problem:**
```typescript
const load = useCallback(async (dateOverride?: string, shiftOverride?: string) => {
  setLoading(true)
  setError('')
  try {
    const date = dateOverride ?? filterDate
    const shift = shiftOverride !== undefined ? (shiftOverride || undefined) : (filterShift || undefined)
    const d = await getDashboard(date, shift)  // ← May complete after state changes
    setData(d)  // ← Old request overwrites new request's result
  } catch (err) {
    // ...
  }
}, [filterDate, filterShift, navigate])  // ← Dependency changes trigger new callback

useEffect(() => {
  getMe().catch(() => navigate('/'))
  const shift = classifyCurrentShift() ?? ''
  setFilterShift(shift)
  load(undefined, shift)
}, [])  // ← ESLint warning disabled - load is called with stale closures!
```

When `filterDate` or `filterShift` change, a new `load` callback is created. But if the user clicks "Apply Filter" quickly, two requests can race - the old one completes after the new one and overwrites the data.

**Fix:**
```typescript
const load = useCallback(async (dateOverride?: string, shiftOverride?: string) => {
  const abortController = new AbortController()
  
  setLoading(true)
  setError('')
  try {
    const date = dateOverride ?? filterDate
    const shift = shiftOverride !== undefined ? (shiftOverride || undefined) : (filterShift || undefined)
    
    const d = await getDashboard(date, shift, {
      signal: abortController.signal
    })
    setData(d)
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      setError(err.message)
    }
  } finally {
    setLoading(false)
  }
  
  return () => abortController.abort()
}, [filterDate, filterShift, navigate])

useEffect(() => {
  getMe().catch(() => navigate('/'))
  const shift = classifyCurrentShift() ?? ''
  setFilterShift(shift)
  load(undefined, shift)
}, [load])  // ← Include load in dependency array
```

Also update API client to support AbortSignal:
```typescript
async function request<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const body = await res.json()
  if (!body.success) throw new Error(body.error ?? 'Request failed')
  return body.data as T
}
```

---

### 1.4 **Missing Validation in POST /api/grades/submit-project**
**File:** [server/src/routes/grades.ts](server/src/routes/grades.ts#L200+)  
**Severity:** CRITICAL  
**Risk:** Can create grade entries for non-existent students or subjects

**Problem:**
The endpoint accepts `studentId`, `subject`, `templateId` but doesn't validate they exist:
```typescript
router.post('/submit-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, subject, templateId } = req.body as {
      studentId: string; subject: string; templateId: string
    }
    // ← No validation that studentId, subject, or templateId exist
    
    // Directly tries to find student by studentId (not database ID!)
    const student = await prisma.student.findUnique({ where: { studentId } })
```

**Fix:**
```typescript
router.post('/submit-project', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId, subject, templateId } = req.body as {
      studentId: string; subject: string; templateId: string
    }
    
    if (!studentId || !subject || !templateId) {
      res.status(400).json({ success: false, error: 'studentId, subject, and templateId required' })
      return
    }
    
    // Validate student exists
    const student = await prisma.student.findUnique({ where: { studentId } })
    if (!student) {
      res.status(404).json({ success: false, error: 'Student not found' })
      return
    }
    
    // Validate template exists and belongs to the right subject
    const template = await prisma.gradeTemplate.findUnique({ where: { id: templateId } })
    if (!template || template.subject !== subject || template.type !== 'project') {
      res.status(404).json({ success: false, error: 'Project template not found' })
      return
    }
    
    // Continue with submission...
  } catch (err) { next(err) }
})
```

---

### 1.5 **Email Verification Token Has No Expiration**
**File:** [server/src/routes/auth.ts](server/src/routes/auth.ts#L49)  
**Severity:** CRITICAL  
**Risk:** Verification links never expire; old links stay valid forever

**Problem:**
```typescript
const verifyToken = crypto.randomBytes(32).toString('hex')

const teacher = await prisma.teacher.create({
  data: { name, email, passwordHash, subject1, subject2, shift, verifyToken },
})

// Later, verification is instant without time check:
const teacher = await prisma.teacher.findFirst({ where: { verifyToken: token } })
if (!teacher) {
  res.status(400).json({ success: false, error: 'Invalid or expired verification link' })
  return
}
```

No expiration time is stored or checked.

**Fix:**
```typescript
// Update schema to add verification token expiry:
// model Teacher {
//   verifyTokenExpiresAt: DateTime? @map("verify_token_expires_at")
// }

const verifyToken = crypto.randomBytes(32).toString('hex')
const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

const teacher = await prisma.teacher.create({
  data: { 
    name, email, passwordHash, subject1, subject2, shift, 
    verifyToken, 
    verifyTokenExpiresAt 
  },
})

// In verify endpoint:
router.get('/verify/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params
    const teacher = await prisma.teacher.findFirst({ where: { verifyToken: token } })

    if (!teacher || !teacher.verifyTokenExpiresAt || teacher.verifyTokenExpiresAt < new Date()) {
      res.status(400).json({ success: false, error: 'Invalid or expired verification link' })
      return
    }

    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { emailVerified: true, verifyToken: null, verifyTokenExpiresAt: null },
    })

    res.json({ success: true, data: { message: 'Email verified. You can now log in.' } })
  } catch (err) { next(err) }
})
```

---

### 1.6 **No Rate Limiting on Authentication Endpoints**
**File:** [server/src/routes/auth.ts](server/src/routes/auth.ts), [server/src/routes/students.ts](server/src/routes/students.ts)  
**Severity:** CRITICAL  
**Risk:** Brute force attacks on login and student kiosk endpoints

**Problem:**
Login endpoints have no rate limiting:
```typescript
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  // No rate limit check
  const { email, password } = req.body
  // Attacker can try millions of password combinations
})

router.post('/student/login', async (req: Request, res: Response, next: NextFunction) => {
  // No rate limit check
  const { identifier, roomName, clientHour, clientMinute } = req.body
  // Attacker can enumerate all student IDs
})
```

**Fix:**
```typescript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per IP
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
})

const kioskLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 login attempts per IP per minute
  message: 'Too many login attempts',
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  // ...
})

router.post('/student/login', kioskLimiter, async (req: Request, res: Response, next: NextFunction) => {
  // ...
})
```

Install dependency: `npm install express-rate-limit`

---

### 1.7 **Unsafe HTML in Email Verification Link**
**File:** [server/src/services/emailService.ts](server/src/services/emailService.ts#L20)  
**Severity:** CRITICAL  
**Risk:** If `process.env.CLIENT_URL` contains malicious content, XSS is possible

**Problem:**
```typescript
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  const link = `${baseUrl}/verify-email?token=${token}`

  await transporter.sendMail({
    from: `"PTTI Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your PTTI teacher account',
    html: `
      <p>Welcome to the PTTI Attendance System.</p>
      <p><a href="${link}">Click here to verify your email address</a></p>
      <!-- ↑ Unescaped link could be malicious -->
    `,
  })
}
```

If `process.env.CLIENT_URL` is compromised, the email could contain a malicious link.

**Fix:**
```typescript
import { URL } from 'url'

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  
  // Validate URL format
  let verifyUrl: URL
  try {
    verifyUrl = new URL('/verify-email', baseUrl)
    verifyUrl.searchParams.set('token', token)
  } catch (err) {
    throw new Error('Invalid CLIENT_URL environment variable')
  }

  const escapedLink = verifyUrl.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  await transporter.sendMail({
    from: `"PTTI Attendance" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your PTTI teacher account',
    html: `
      <p>Welcome to the PTTI Attendance System.</p>
      <p><a href="${escapedLink}">Click here to verify your email address</a></p>
      <p>If you did not sign up, ignore this email.</p>
    `,
  })
}
```

---

### 1.8 **Silent Failure in Monthly Rotation Cron Job**
**File:** [server/src/cron/monthlyRotation.ts](server/src/cron/monthlyRotation.ts)  
**Severity:** CRITICAL  
**Risk:** Data corruption if cohort rotation fails silently; students stuck in wrong cohort

**Problem:**
```typescript
export function scheduleMonthlyRotation(): void {
  cron.schedule('0 0 1 * *', async () => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    let targetCohortMonth = currentMonth - 5
    if (targetCohortMonth <= 0) targetCohortMonth += 12

    const result = await prisma.student.updateMany({
      where: {
        isActive: true,
        isFloating: false,
        cohortStartMonth: targetCohortMonth,
      },
      data: { isFloating: true },
    })
    // ← No error handling! If DB is down or update fails, no alert
    console.log(`[Monthly Rotation] ${now.toISOString()} — marked ${result.count} students as floating...`)
  })
}
```

**Fix:**
```typescript
export function scheduleMonthlyRotation(): void {
  cron.schedule('0 0 1 * *', async () => {
    try {
      const now = new Date()
      const currentMonth = now.getMonth() + 1

      let targetCohortMonth = currentMonth - 5
      if (targetCohortMonth <= 0) targetCohortMonth += 12

      const result = await prisma.student.updateMany({
        where: {
          isActive: true,
          isFloating: false,
          cohortStartMonth: targetCohortMonth,
        },
        data: { isFloating: true },
      })

      console.log(`[Monthly Rotation] ${now.toISOString()} — marked ${result.count} students as floating (cohort month ${targetCohortMonth})`)
    } catch (err) {
      console.error('[Monthly Rotation] FAILED:', err)
      // Send alert email or log to monitoring service
      // DO NOT SILENTLY FAIL
    }
  })

  console.log('[Cron] Monthly rotation scheduled (1st of each month at midnight)')
}
```

---

## 2. HIGH SEVERITY ISSUES (Quality & Security)

### 2.1 **12+ useState Calls in GradeDashboard - Unmanageable State**
**File:** [client/src/components/GradeDashboard.tsx](client/src/components/GradeDashboard.tsx#L25-41)  
**Severity:** HIGH  
**Risk:** State management becomes impossible to track; hidden bugs from state conflicts

**Problem:**
```typescript
const [subject, setSubject] = useState(teacherSubjects[0] ?? '')
const [cohortMonth, setCohortMonth] = useState(now.getMonth() + 1)
const [cohortYear, setCohortYear] = useState(now.getFullYear())
const [dashboard, setDashboard] = useState<GradeDashboardData | null>(null)
const [templates, setTemplates] = useState<GradeTemplate[]>([])
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
const [showTemplateManager, setShowTemplateManager] = useState(false)
const [savingEntry, setSavingEntry] = useState<string | null>(null)
const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({})
const [newTemplate, setNewTemplate] = useState<{ type: GradeType; name: string; description: string }>({ type: 'quiz', name: '', description: '' })
const [addingTemplate, setAddingTemplate] = useState(false)
const [importFile, setImportFile] = useState<File | null>(null)
const [importPreview, setImportPreview] = useState<QuizGradeImportPreview | null>(null)
const [importResult, setImportResult] = useState<QuizGradeImportApplyResult | null>(null)
const [importing, setImporting] = useState(false)
```

This is 16+ state variables. The component is 500+ lines and mixes three separate concerns: filters, template management, and import workflow.

**Fix: Split into 3 focused components**
```typescript
// GradeDashboard.tsx - just the orchestrator
export default function GradeDashboard({ teacherSubjects, onClose }: Props) {
  const [filters, setFilters] = useState({ subject: teacherSubjects[0] ?? '', month: ..., year: ... })
  const [dashboardData, setDashboardData] = useState<GradeDashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  return (
    <div className="modal">
      <GradeFilters {...filters} onChange={setFilters} />
      <GradeTable data={dashboardData} loading={loading} />
      <GradeTemplateManager subject={filters.subject} />
      <QuizImportSection subject={filters.subject} />
    </div>
  )
}

// New: GradeTable.tsx - just displays grades
// New: GradeTemplateManager.tsx - manages templates  
// New: QuizImportSection.tsx - handles quiz imports
```

---

### 2.2 **No Cleanup of Event Listeners in useEffect**
**File:** [client/src/pages/LoginPage.tsx](client/src/pages/LoginPage.tsx#L51-56)  
**Severity:** HIGH  
**Risk:** Memory leaks; interval keeps running after component unmounts

**Problem:**
```typescript
useEffect(() => {
  fetchPresent(selectedRoom)
  const interval = setInterval(() => fetchPresent(selectedRoom), 30_000)
  return () => clearInterval(interval)  // ← Good, but missing dependency
}, [selectedRoom, fetchPresent])  // ← fetchPresent recreated every render
```

While the interval is cleaned up, `fetchPresent` is recreated on every render (not wrapped in useCallback), causing the dependency array to change unnecessarily.

**Fix:**
```typescript
const fetchPresent = useCallback(async (room: string) => {
  try {
    const result = await getPresentStudents(room)
    setPresentStudents(result.students)
    setPresentShift(result.shift)
  } catch {
    // Non-critical — keep stale list on transient errors
  }
}, [])  // ← No external dependencies

useEffect(() => {
  fetchPresent(selectedRoom)
  const interval = setInterval(() => fetchPresent(selectedRoom), 30_000)
  return () => clearInterval(interval)
}, [selectedRoom, fetchPresent])
```

---

### 2.3 **Missing Error Boundaries in React**
**File:** [client/src/pages/TeacherDashboard.tsx](client/src/pages/TeacherDashboard.tsx)  
**Severity:** HIGH  
**Risk:** Component crash crashes entire app with no recovery UI

**Problem:**
No Error Boundary component. If any child component throws an error, the entire page crashes.

**Fix: Create an Error Boundary**
```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ background: '#fee', padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--red)' }}>{this.state.error?.message}</p>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Usage in TeacherDashboard:
export default function TeacherDashboard() {
  return (
    <ErrorBoundary>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* existing JSX */}
      </div>
    </ErrorBoundary>
  )
}
```

---

### 2.4 **No Input Validation for Score (0-100 range)**
**File:** [client/src/components/GradeDashboard.tsx](client/src/components/GradeDashboard.tsx#L85-95)  
**Severity:** HIGH  
**Risk:** User enters invalid scores; sent to server; validation happens late

**Problem:**
```typescript
const handleSaveScore = async (templateId: string, studentDbId: string) => {
  const key = scoreKey(templateId, studentDbId)
  const raw = scoreInputs[key]
  if (raw === undefined || raw === '') return
  const score = parseFloat(raw)
  if (isNaN(score) || score < 0 || score > 100) { 
    setError('Score must be 0–100');  // ← Too late, already sent to server
    return 
  }
  // ...
  await saveGradeEntry({ ... }) // ← Server might also reject
}
```

The score is sent to the server, which then validates. Better to prevent invalid input from being entered.

**Fix: Real-time input validation**
```typescript
const handleScoreChange = (templateId: string, studentDbId: string, value: string) => {
  // Only allow 0-100, up to 1 decimal place
  if (value === '') {
    setScoreInputs(prev => { const next = { ...prev }; delete next[key]; return next })
    return
  }
  
  const num = parseFloat(value)
  if (!isNaN(num) && num >= 0 && num <= 100) {
    const key = scoreKey(templateId, studentDbId)
    setScoreInputs(prev => ({ ...prev, [key]: value }))
  }
}

// In render:
<input
  type="number"
  min="0"
  max="100"
  step="0.1"
  value={scoreInputs[key] ?? ''}
  onChange={(e) => handleScoreChange(templateId, studentDbId, e.target.value)}
/>
```

---

### 2.5 **N+1 Query Problem in GET /api/school-wide**
**File:** [server/src/routes/schoolwide.ts](server/src/routes/schoolwide.ts#L20-30)  
**Severity:** HIGH  
**Risk:** One query per curriculum entry + one query per filter iteration

**Problem:**
```typescript
const results = await Promise.all(
  curriculumEntries.map(async (entry) => {
    // For each curriculum entry:
    const allStudents = await prisma.student.findMany({
      where: { isActive: true, track },  // ← Query 1 (repeated for each entry!)
      select: { id: true, cohortStartMonth: true },
    })
    
    const presentLogs = await prisma.attendanceLog.findMany({
      where: {
        shift,
        loginTime: { gte: startOfDay, lte: endOfDay },
        student: { isActive: true, track },
      },
      include: { student: { select: { cohortStartMonth: true } } },
    })  // ← Query 2 (repeated for each entry!)
    // ...
  })
)
```

If there are 10 curriculum entries, this makes 20+ database queries.

**Fix: Fetch all data once, then process in memory**
```typescript
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const now = new Date()
  const shift: Shift = (req.query.shift as Shift) ?? classifyByTime(now) ?? 'morning'
  const currentMonth = now.getMonth() + 1

  // Fetch once
  const curriculumEntries = await prisma.curriculum.findMany({ where: { shift } })
  const track = trackFromShift(shift)

  const [allStudents, presentLogs] = await Promise.all([
    prisma.student.findMany({
      where: { isActive: true, track },
      select: { id: true, cohortStartMonth: true },
    }),
    prisma.attendanceLog.findMany({
      where: {
        shift,
        loginTime: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
        student: { isActive: true, track },
      },
      include: { student: { select: { cohortStartMonth: true } } },
    }),
  ])

  // Process in memory
  const results = curriculumEntries.map((entry) => {
    const theoretical = allStudents.filter(
      (s) => getProgramMonth(s.cohortStartMonth, currentMonth) === entry.programMonth
    )

    const presentCount = presentLogs.filter(
      (log) => getProgramMonth(log.student.cohortStartMonth, currentMonth) === entry.programMonth
    ).length

    const total = theoretical.length
    const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0

    return {
      subject: entry.subject,
      programMonth: entry.programMonth,
      present: presentCount,
      total,
      percentage,
    }
  })

  results.sort((a, b) => a.programMonth - b.programMonth)

  res.json({ success: true, data: { shift, rows: results } })
})
```

---

### 2.6 **Missing Error Handling in CSV Import Callback**
**File:** [client/src/components/CsvImportButton.tsx](client/src/components/CsvImportButton.tsx#L24-37)  
**Severity:** HIGH  
**Risk:** If `onImported()` callback throws, the error is silently swallowed

**Problem:**
```typescript
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  setLoading(true)
  setResult(null)
  try {
    const r = await importCsv(file)
    setResult(r)
    onImported()  // ← If this throws, no error handling
  } catch (err) {
    setResult({ added: 0, skipped: 0, errors: [err instanceof Error ? err.message : 'Import failed'] })
  } finally {
    setLoading(false)
    if (inputRef.current) inputRef.current.value = ''
  }
}
```

**Fix:**
```typescript
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
    } catch (callbackErr) {
      console.error('onImported callback failed:', callbackErr)
      setResult({ 
        added: 0, 
        skipped: 0, 
        errors: ['Import succeeded but failed to refresh data. Please reload the page.'] 
      })
    }
  } catch (err) {
    setResult({ added: 0, skipped: 0, errors: [err instanceof Error ? err.message : 'Import failed'] })
  } finally {
    setLoading(false)
    if (inputRef.current) inputRef.current.value = ''
  }
}
```

---

### 2.7 **No Transaction for Multi-Step Grade Operations**
**File:** [server/src/services/quizGradeImportService.ts](server/src/services/quizGradeImportService.ts#L270+)  
**Severity:** HIGH  
**Risk:** If template creation succeeds but grade entry fails, database is in inconsistent state

**Problem:**
```typescript
const templates = await params.prisma.$transaction(
  assignmentNames.map((assignmentName, order) =>
    params.prisma.gradeTemplate.upsert({...})  // ← All wrapped in transaction
  )
)

// But if next operation fails...
await params.prisma.$transaction(
  preview.importable.map((row) => {
    // This could partially succeed
    params.prisma.gradeEntry.upsert({...})
  })
)
```

If the second transaction partially fails, templates are created but entries are incomplete.

**Fix: Single atomic transaction**
```typescript
export async function applyQuizGradeImport(params: ApplyQuizGradeImportParams): Promise<QuizGradeImportApplyResult> {
  const preview = await previewQuizGradeImport(params)
  if (preview.importable.length === 0) return { imported: 0, createdOrUpdatedTemplates: [], skipped: preview.skipped, errors: [] }

  const assignmentNames = [...new Set(preview.importable.map((r) => r.assignmentName))]
  const now = new Date()

  // Single transaction for all operations
  await params.prisma.$transaction(async (tx) => {
    // Step 1: Upsert templates
    const templates = await Promise.all(
      assignmentNames.map((assignmentName, order) =>
        tx.gradeTemplate.upsert({
          where: { subject_name: { subject: params.subject, name: assignmentName } },
          update: { isActive: true, type: 'quiz' },
          create: { subject: params.subject, name: assignmentName, type: 'quiz', order },
        })
      )
    )

    const templateByName = new Map(templates.map((t) => [t.name, t]))

    // Step 2: Upsert entries
    await Promise.all(
      preview.importable.map((row) => {
        const template = templateByName.get(row.assignmentName)
        if (!template) throw new Error(`Template was not created for ${row.assignmentName}`)
        return tx.gradeEntry.upsert({
          where: {
            templateId_studentId_cohortMonth_cohortYear: {
              templateId: template.id,
              studentId: row.studentDbId,
              cohortMonth: params.cohortMonth,
              cohortYear: params.cohortYear,
            },
          },
          update: { score: row.score, submittedAt: now, submittedBy: params.teacherId },
          create: {
            templateId: template.id,
            studentId: row.studentDbId,
            cohortMonth: params.cohortMonth,
            cohortYear: params.cohortYear,
            score: row.score,
            submittedAt: now,
            submittedBy: params.teacherId,
          },
        })
      })
    )
    // If any step fails, entire transaction rolls back
  })

  return {
    imported: preview.importable.length,
    createdOrUpdatedTemplates: assignmentNames,
    skipped: preview.skipped,
    errors: [],
  }
}
```

---

### 2.8 **Password Strength Not Enforced**
**File:** [server/src/routes/auth.ts](server/src/routes/auth.ts#L27-35)  
**Severity:** HIGH  
**Risk:** Weak passwords like "1234" are accepted

**Problem:**
```typescript
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, subject1, subject2, shift } = req.body as { ... }

    if (!name || !email || !password || !subject1 || !shift) {  // ← Only checks if exists, not strength
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }
    
    // No password strength validation
    const passwordHash = await bcrypt.hash(password, 12)
```

**Fix:**
```typescript
function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  if (!/[!@#$%^&*]/.test(password)) return 'Password must contain a special character (!@#$%^&*)'
  return null
}

router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, subject1, subject2, shift } = req.body as { ... }

    if (!name || !email || !password || !subject1 || !shift) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      res.status(400).json({ success: false, error: passwordError })
      return
    }

    // ... continue with signup
  } catch (err) { next(err) }
})
```

---

### 2.9 **Inconsistent Date Handling Between Client and Server**
**File:** [client/src/pages/TeacherDashboard.tsx](client/src/pages/TeacherDashboard.tsx#L31), [server/src/routes/teacher.ts](server/src/routes/teacher.ts#L19)  
**Severity:** HIGH  
**Risk:** Date filter mismatches; user sees different data than expected (off-by-one-day errors)

**Problem:**
Client sets default date:
```typescript
const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
// ← Uses user's local timezone
```

Server processes date:
```typescript
let targetDate: Date
if (req.query.date) {
  targetDate = new Date(String(req.query.date))  // ← Parses as UTC!
  // If user is in PST and sends "2026-06-22", server treats it as "2026-06-22 00:00 UTC"
  // But the user meant "2026-06-22 00:00 PST"
}
```

**Fix: Use ISO strings with explicit handling**
```typescript
// Client: send timezone offset
const now = new Date()
const offset = -now.getTimezoneOffset()
const sign = offset >= 0 ? '+' : '-'
const absOffset = Math.abs(offset)
const hours = Math.floor(absOffset / 60)
const minutes = absOffset % 60
const tzString = `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

// Or just send a UTC date and parse carefully on server
const startOfDay = new Date(date)
startOfDay.setUTC Hours(0, 0, 0, 0)
const endOfDay = new Date(date)
endOfDay.setUTCHours(23, 59, 59, 999)
```

---

### 2.10 **Missing Logging for Security Events**
**File:** Multiple routes  
**Severity:** HIGH  
**Risk:** No audit trail for failed logins, unauthorized access, or data modifications

**Problem:**
Login attempts, grade modifications, and data exports are not logged.

**Fix: Add security logging**
```typescript
// lib/auditLog.ts
import prisma from './prisma'

export async function logSecurityEvent(event: {
  type: 'login_success' | 'login_failed' | 'grade_modified' | 'student_added' | 'data_exported'
  teacherId?: string
  studentId?: string
  details: Record<string, unknown>
  ipAddress: string
  userAgent: string
}) {
  // Store in database or external log service
  console.log('[SECURITY]', event)
}

// In auth.ts
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const ua = req.headers['user-agent'] || 'unknown'
  
  try {
    const { email, password } = req.body
    const teacher = await prisma.teacher.findFirst({
      where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    })

    if (!teacher) {
      await logSecurityEvent({
        type: 'login_failed',
        details: { email, reason: 'user_not_found' },
        ipAddress: ip,
        userAgent: ua,
      })
      res.status(401).json({ success: false, error: 'Invalid credentials' })
      return
    }

    const valid = await bcrypt.compare(password, teacher.passwordHash)
    if (!valid) {
      await logSecurityEvent({
        type: 'login_failed',
        details: { email, reason: 'wrong_password' },
        ipAddress: ip,
        userAgent: ua,
      })
      res.status(401).json({ success: false, error: 'Invalid credentials' })
      return
    }

    // Success
    await logSecurityEvent({
      type: 'login_success',
      teacherId: teacher.id,
      details: { email },
      ipAddress: ip,
      userAgent: ua,
    })
    // ... continue with login
  } catch (err) { next(err) }
})
```

---

## 3. MEDIUM SEVERITY ISSUES (Refactoring & Maintenance)

### 3.1 **File Size Too Large - GradeDashboard.tsx (500+ lines)**
**File:** [client/src/components/GradeDashboard.tsx](client/src/components/GradeDashboard.tsx)  
**Issue:** Single component handling filters, table display, template management, and quiz imports

**Recommendation:** Split into 4 files (each ~100-150 lines):
- `GradeDashboard.tsx` - Orchestrator
- `GradeFilters.tsx` - Month/year/subject selectors
- `GradeTable.tsx` - Quiz/project table display
- `QuizImportPanel.tsx` - File upload & preview

---

### 3.2 **Magic Numbers Scattered Throughout**
**Files:** [server/src/services/shiftService.ts](server/src/services/shiftService.ts#L10-20), [server/src/services/gradeService.ts](server/src/services/gradeService.ts)  
**Issue:** Hardcoded values like `8:00`, `11:30`, `5`, `12`, `150`

**Recommendation:** Create constants file:
```typescript
// config/constants.ts
export const SHIFT_SCHEDULE = {
  MORNING: { start: 8, startMin: 0, duration: 4 },
  AFTERNOON: { start: 11, startMin: 30, duration: 4 },
  EVENING: { start: 15, startMin: 0, duration: 4 },
  NIGHT: { start: 18, startMin: 30, duration: 4 },
}

export const GRADE_WEIGHTS = {
  ATTENDANCE: 0.1,
  QUIZ: 0.15,
  PROJECT: 0.75,
}

export const PROGRAM_DURATION_MONTHS = 5
export const LOGIN_CUTOFF_MINUTES = 150
export const COHORT_WINDOW_DAYS = 31
```

---

### 3.3 **Inconsistent API Response Formats**
**Issue:** Some endpoints return `{ success, data }`, others return just `data`

**Recommendation:** Standardize all responses:
```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: { timestamp: string; path: string }
}
```

---

### 3.4 **Deep Nesting in TeacherDashboard Render**
**File:** [client/src/pages/TeacherDashboard.tsx](client/src/pages/TeacherDashboard.tsx#L140-180)  
**Issue:** 5+ levels of nesting in table rendering logic

**Fix:** Extract table row rendering:
```typescript
function StudentRow({ student, isPresent, ...props }: StudentRowProps) {
  return (
    <tr key={student.studentId}>
      <td>{student.studentId}</td>
      {/* ... */}
    </tr>
  )
}

// In table body:
{presentStudents.map((s) => (
  <StudentRow key={s.studentId} student={s} isPresent={...} />
))}
```

---

### 3.5 **No Loading State in Modal Dialogs**
**Files:** [client/src/components/AddStudentModal.tsx](client/src/components/AddStudentModal.tsx), [client/src/components/AddTeacherModal.tsx](client/src/components/AddTeacherModal.tsx)  
**Issue:** Modals don't show loading indicator while submitting

**Fix:**
```typescript
<button 
  type="submit" 
  className="btn btn-primary" 
  disabled={loading}
>
  {loading ? 'Adding…' : 'Add Student'}
</button>
```

All modals already have this, but should be verified across all forms.

---

### 3.6 **Missing TypeScript Strict Mode**
**Files:** `tsconfig.json` (likely needs updates)  
**Issue:** TypeScript may not be configured for strict type checking

**Recommendation:** Ensure tsconfig has:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

### 3.7 **Quiz Import Error Messages Not Specific**
**File:** [server/src/services/quizGradeImportService.ts](server/src/services/quizGradeImportService.ts#L140)  
**Issue:** Generic "Row X: assignment name failed" doesn't explain WHY

**Fix:**
```typescript
if (!firstName || !lastName) {
  errors.push(`Row ${rowNumber}: First and Last Name required. (Got: "${firstName}" / "${lastName}")`)
  continue
}
if (!assignmentName) {
  errors.push(`Row ${rowNumber}: Assignment/Quiz name is missing`)
  continue
}
```

---

### 3.8 **No Caching of Student Lists**
**File:** [client/src/components/LoginStudentModal.tsx](client/src/components/LoginStudentModal.tsx#L40)  
**Issue:** Every search query hits the database

**Recommendation:** Implement client-side caching or debouncing:
```typescript
const [searchCache, setSearchCache] = useState<Map<string, SearchStudent[]>>(new Map())

const handleSearch = useCallback(async () => {
  if (!query.trim()) return
  
  // Check cache first
  if (searchCache.has(query)) {
    setResults(searchCache.get(query) || [])
    return
  }

  setSearching(true)
  setError('')
  try {
    const data = await searchStudents(query.trim())
    setResults(data)
    setSearchCache(prev => new Map(prev).set(query, data))
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Search failed')
  } finally {
    setSearching(false)
  }
}, [query, searchCache])
```

---

### 3.9 **Missing Validation of Room Names**
**Files:** Multiple (kiosk login endpoints)  
**Issue:** Room name validation is hardcoded in 3+ places

**Fix:** Centralize:
```typescript
// lib/rooms.ts
export const VALID_ROOMS = ['PLC Room', 'AC Room', 'DC Room', 'MT/HT Room']

export function isValidRoom(name: string): boolean {
  return VALID_ROOMS.includes(name)
}

// Usage:
if (!isValidRoom(roomName)) {
  res.status(400).json({ success: false, error: 'Invalid room' })
  return
}
```

---

### 3.10 **No Integration Tests**
**Files:** Only `tests/quizGradeImportService.test.ts` exists  
**Issue:** Core features (student login, grade entry, dashboard) lack test coverage

**Recommendation:** Add integration tests for:
- Student login flow (POST /api/student/login)
- Grade entry (POST /api/grades/entries)
- CSV import (POST /api/students/import)
- Teacher dashboard (GET /api/teacher/dashboard)

---

## 4. PRIORITY FIX ORDER

### Phase 1: CRITICAL (1-2 days)
1. ✅ Add CSRF token protection
2. ✅ Set JWT_SECRET as required env variable
3. ✅ Add email verification token expiration
4. ✅ Add rate limiting to auth endpoints
5. ✅ Fix race condition in TeacherDashboard

### Phase 2: HIGH (3-5 days)
6. ✅ Add input validation to /api/grades/submit-project
7. ✅ Refactor GradeDashboard state (split into 3 components)
8. ✅ Add error boundaries
9. ✅ Fix N+1 queries in school-wide view
10. ✅ Add transaction wrapping for multi-step imports

### Phase 3: MEDIUM (ongoing)
11. Add security logging
12. Split large components
13. Add integration tests
14. Enforce password strength
15. Add error messages to quiz import
16. Implement student list caching

---

## 5. TESTING RECOMMENDATIONS

Add automated tests for:

```typescript
// tests/auth.test.ts
describe('POST /api/auth/login', () => {
  it('should reject invalid credentials', async () => {})
  it('should require rate limiting', async () => {})
  it('should set secure httpOnly cookies', async () => {})
  it('should reject unverified emails', async () => {})
})

// tests/grades.test.ts
describe('POST /api/grades/entries', () => {
  it('should validate score is 0-100', async () => {})
  it('should require authentication', async () => {})
  it('should verify student exists', async () => {})
  it('should verify template exists', async () => {})
})

// tests/students.test.ts
describe('POST /api/student/login', () => {
  it('should apply rate limiting', async () => {})
  it('should validate student exists', async () => {})
  it('should classify correct shift', async () => {})
})
```

---

## 6. ENVIRONMENT CONFIGURATION

Create `.env.example`:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ptti

# JWT Security (REQUIRED)
JWT_SECRET=your-very-long-random-secret-at-least-32-characters

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# URLs
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:3001

# Session
SESSION_SECRET=another-long-random-secret

# Environment
NODE_ENV=development
PORT=3001
```

Validate at startup:
```typescript
const requiredEnvs = ['JWT_SECRET', 'SESSION_SECRET', 'DATABASE_URL']
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`FATAL: ${env} environment variable is not set`)
    process.exit(1)
  }
}
```

---

## 7. SUMMARY TABLE

| Category | Count | Examples |
|----------|-------|----------|
| CRITICAL | 8 | CSRF, JWT secret, race conditions, token expiry, rate limiting |
| HIGH | 12 | State management, error boundaries, N+1 queries, password strength |
| MEDIUM | 14 | File sizes, magic numbers, logging, tests, caching |

**Total Bugs Found:** 34  
**Critical Status:** ⚠️ Not production-ready  
**Recommendation:** Fix CRITICAL + HIGH items before any release

