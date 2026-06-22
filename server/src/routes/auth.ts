import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { Shift } from '@prisma/client'
import prisma from '../lib/prisma'
import { sendVerificationEmail } from '../services/emailService'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, please try again later' },
})

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many signup attempts, please try again later' },
})

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  return null
}

const VALID_SUBJECTS = [
  'PLC 1', 'PLC 2', 'PLC 3',
  'DC 1', 'DC 2', 'DC 3',
  'AC 1', 'AC 2',
  'MT', 'HT',
]

const VALID_SHIFTS: Shift[] = ['morning', 'afternoon', 'evening', 'night']

// POST /api/auth/signup
router.post('/signup', signupLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, subject1, subject2, shift } = req.body as {
      name: string
      email: string
      password: string
      subject1: string
      subject2?: string
      shift: Shift
    }

    if (!name || !email || !password || !subject1 || !shift) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      res.status(400).json({ success: false, error: passwordError })
      return
    }
    if (!VALID_SUBJECTS.includes(subject1)) {
      res.status(400).json({ success: false, error: `Invalid subject: ${subject1}` })
      return
    }
    if (subject2 && !VALID_SUBJECTS.includes(subject2)) {
      res.status(400).json({ success: false, error: `Invalid subject2: ${subject2}` })
      return
    }
    if (!VALID_SHIFTS.includes(shift)) {
      res.status(400).json({ success: false, error: `Invalid shift: ${shift}` })
      return
    }

    const existing = await prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const teacher = await prisma.teacher.create({
      data: { name, email, passwordHash, subject1, subject2, shift, verifyToken, verifyTokenExpiresAt },
    })

    await sendVerificationEmail(email, verifyToken)

    res.status(201).json({
      success: true,
      data: { id: teacher.id, email: teacher.email, message: 'Check your email to verify your account.' },
    })
  } catch (err) { next(err) }
})

// GET /api/auth/verify/:token
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

// POST /api/auth/add-teacher — authenticated teacher creates another teacher (auto-verified)
router.post('/add-teacher', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, subject1, subject2, subject3, shift } = req.body as {
      name: string
      email: string
      password: string
      subject1: string
      subject2?: string
      subject3?: string
      shift: Shift
    }

    if (!name || !email || !password || !subject1 || !shift) {
      res.status(400).json({ success: false, error: 'Name, email, password, subject 1, and shift are required' })
      return
    }
    if (!VALID_SUBJECTS.includes(subject1)) {
      res.status(400).json({ success: false, error: `Invalid subject1: ${subject1}` })
      return
    }
    if (subject2 && !VALID_SUBJECTS.includes(subject2)) {
      res.status(400).json({ success: false, error: `Invalid subject2: ${subject2}` })
      return
    }
    if (subject3 && !VALID_SUBJECTS.includes(subject3)) {
      res.status(400).json({ success: false, error: `Invalid subject3: ${subject3}` })
      return
    }
    if (!VALID_SHIFTS.includes(shift)) {
      res.status(400).json({ success: false, error: `Invalid shift: ${shift}` })
      return
    }

    const existing = await prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const teacher = await prisma.teacher.create({
      data: { name, email, passwordHash, subject1, subject2, subject3, shift, emailVerified: true },
    })

    res.status(201).json({
      success: true,
      data: { id: teacher.id, name: teacher.name, email: teacher.email },
    })
  } catch (err) { next(err) }
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email: string; password: string }

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' })
      return
    }

    const teacher = await prisma.teacher.findFirst({
      where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    })
    if (!teacher) {
      res.status(401).json({ success: false, error: 'Invalid credentials' })
      return
    }
    if (!teacher.emailVerified) {
      res.status(403).json({ success: false, error: 'Please verify your email before logging in' })
      return
    }

    const valid = await bcrypt.compare(password, teacher.passwordHash)
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' })
      return
    }

    const token = jwt.sign(
      { teacherId: teacher.id, email: teacher.email },
      process.env.JWT_SECRET ?? 'dev-secret',
      { expiresIn: '8h' }
    )

    const isProd = process.env.NODE_ENV === 'production'
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    })

    res.json({
      success: true,
      data: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        subject1: teacher.subject1,
        subject2: teacher.subject2,
        subject3: teacher.subject3,
        shift: teacher.shift,
      },
    })
  } catch (err) { next(err) }
})

// DELETE /api/auth/teacher — remove a teacher account (cannot delete yourself)
router.delete('/teacher', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email: string }
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' })
      return
    }
    if (email.toLowerCase() === req.teacher!.email.toLowerCase()) {
      res.status(400).json({ success: false, error: 'You cannot delete your own account' })
      return
    }

    const teacher = await prisma.teacher.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (!teacher) {
      res.status(404).json({ success: false, error: 'No teacher found with that email' })
      return
    }

    // Reassign rooms to the acting teacher so the FK constraint is satisfied
    await prisma.room.updateMany({
      where: { createdBy: teacher.id },
      data: { createdBy: req.teacher!.teacherId },
    })
    await prisma.teacher.delete({ where: { id: teacher.id } })

    res.json({ success: true, data: { message: `${teacher.name} has been deleted` } })
  } catch (err) { next(err) }
})

// POST /api/auth/logout
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  res.clearCookie('token')
  res.json({ success: true, data: { message: 'Logged out' } })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.teacher!.teacherId },
      select: { id: true, name: true, email: true, subject1: true, subject2: true, subject3: true, shift: true },
    })
    if (!teacher) {
      res.status(404).json({ success: false, error: 'Teacher not found' })
      return
    }
    res.json({ success: true, data: teacher })
  } catch (err) { next(err) }
})

export default router
