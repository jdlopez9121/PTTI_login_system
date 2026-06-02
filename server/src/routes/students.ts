import { Router, Request, Response } from 'express'
import multer from 'multer'
import { PrismaClient, Track } from '@prisma/client'
import { validateLoginTime, hoursCredited, classifyByTime } from '../services/shiftService'
import { importStudentsFromBuffer } from '../services/csvImportService'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// POST /api/student/login — kiosk login, no auth required
router.post('/login', async (req: Request, res: Response) => {
  const { identifier, roomName, clientHour, clientMinute } = req.body as { identifier: string; roomName: string; clientHour?: number; clientMinute?: number }

  const STATIC_ROOMS = ['PLC Room', 'AC Room', 'DC Room', 'MT/HT Room']

  if (!identifier?.trim() || !roomName?.trim()) {
    res.status(400).json({ success: false, error: 'Student identifier and room name are required' })
    return
  }
  if (!STATIC_ROOMS.includes(roomName)) {
    res.status(400).json({ success: false, error: `Invalid room. Must be one of: ${STATIC_ROOMS.join(', ')}` })
    return
  }

  const id = identifier.trim()

  const student = await prisma.student.findFirst({
    where: { isActive: true, studentId: id },
  })

  if (!student) {
    res.status(404).json({ success: false, error: 'Student ID not found. Please check your ID and try again.' })
    return
  }

  const hour  = clientHour   !== undefined ? clientHour   : new Date().getHours()
  const minute = clientMinute !== undefined ? clientMinute : new Date().getMinutes()

  const validation = validateLoginTime(hour, minute)
  const shift = validation.shift

  const loginTime = new Date()
  const log = await prisma.attendanceLog.create({
    data: {
      studentId: student.id,
      loginTime,
      date: loginTime,
      shift,
      roomName,
      hoursCredit: hoursCredited(shift),
    },
  })

  res.status(201).json({
    success: true,
    data: {
      logId: log.id,
      studentName: student.fullName,
      shift,
      room: roomName,
      hoursCredit: log.hoursCredit,
      warning: validation.warning ?? null,
    },
  })
})

// GET /api/student/present — public kiosk endpoint: who is signed in for the current room/shift today
router.get('/present', async (req: Request, res: Response) => {
  const room = String(req.query.room ?? '').trim()
  const STATIC_ROOMS = ['PLC Room', 'AC Room', 'DC Room', 'MT/HT Room']

  if (!room || !STATIC_ROOMS.includes(room)) {
    res.status(400).json({ success: false, error: 'Valid room parameter required' })
    return
  }

  const clientHour   = req.query.clientHour   !== undefined ? parseInt(String(req.query.clientHour))   : undefined
  const clientMinute = req.query.clientMinute !== undefined ? parseInt(String(req.query.clientMinute)) : undefined

  const now = new Date()
  if (clientHour   !== undefined) now.setHours(clientHour)
  if (clientMinute !== undefined) now.setMinutes(clientMinute)
  const currentShift = classifyByTime(now)

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const logs = await prisma.attendanceLog.findMany({
    where: {
      roomName: room,
      loginTime: { gte: startOfDay, lte: endOfDay },
      ...(currentShift ? { shift: currentShift } : {}),
    },
    include: {
      student: { select: { studentId: true, fullName: true } },
    },
    orderBy: { loginTime: 'asc' },
  })

  res.json({
    success: true,
    data: {
      shift: currentShift,
      room,
      students: logs.map((log) => ({
        studentId: log.student.studentId,
        fullName: log.student.fullName,
        loginTime: log.loginTime,
      })),
    },
  })
})

// GET /api/students/search — search for student (teacher auth, for Login Student modal)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) {
    res.json({ success: true, data: [] })
    return
  }

  const students = await prisma.student.findMany({
    where: {
      isActive: true,
      OR: [
        { studentId: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    select: { id: true, studentId: true, fullName: true, cohortStartMonth: true, track: true },
  })

  res.json({ success: true, data: students })
})

// POST /api/students — add student manually (teacher auth)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { studentId, fullName, cohortStartMonth, track } = req.body as {
    studentId: string
    fullName: string
    cohortStartMonth: number
    track: Track
  }

  if (!studentId || !fullName || !cohortStartMonth || !track) {
    res.status(400).json({ success: false, error: 'All fields are required' })
    return
  }

  const existing = await prisma.student.findUnique({ where: { studentId } })
  if (existing) {
    res.status(409).json({ success: false, error: 'A student with this ID already exists' })
    return
  }

  const student = await prisma.student.create({
    data: { studentId, fullName, cohortStartMonth: Number(cohortStartMonth), track },
  })

  res.status(201).json({ success: true, data: student })
})

// POST /api/students/import — CSV/XLSX upload (teacher auth)
router.post('/import', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' })
    return
  }

  const result = await importStudentsFromBuffer(req.file.buffer)
  res.json({ success: true, data: result })
})

// POST /api/attendance/manual — teacher-initiated login with custom date+time
router.post('/attendance/manual', requireAuth, async (req: Request, res: Response) => {
  const { studentDbId, loginTime, roomName } = req.body as {
    studentDbId: string
    loginTime: string
    roomName: string
  }

  if (!studentDbId || !loginTime || !roomName) {
    res.status(400).json({ success: false, error: 'studentDbId, loginTime, and roomName are required' })
    return
  }

  const date = new Date(loginTime)
  if (isNaN(date.getTime())) {
    res.status(400).json({ success: false, error: 'Invalid loginTime format' })
    return
  }

  const student = await prisma.student.findUnique({ where: { id: studentDbId } })
  if (!student) {
    res.status(404).json({ success: false, error: 'Student not found' })
    return
  }

  const shift = classifyByTime(date)
  if (!shift) {
    res.status(400).json({ success: false, error: 'The provided time does not fall within any shift window' })
    return
  }

  const log = await prisma.attendanceLog.create({
    data: {
      studentId: student.id,
      loginTime: date,
      date,
      shift,
      roomName,
      hoursCredit: hoursCredited(shift),
    },
  })

  res.status(201).json({
    success: true,
    data: {
      logId: log.id,
      studentName: student.fullName,
      shift,
      room: roomName,
      hoursCredit: log.hoursCredit,
    },
  })
})


export default router
