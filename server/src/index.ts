import 'dotenv/config'
import express from 'express'
import fs from 'fs/promises'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRouter from './routes/auth'
import studentsRouter from './routes/students'
import teacherRouter from './routes/teacher'
import roomsRouter from './routes/rooms'
import schoolwideRouter from './routes/schoolwide'
import gradesRouter from './routes/grades'
import notificationsRouter from './routes/notifications'
import workOrdersRouter from './routes/workOrders'
import { scheduleMonthlyRotation } from './cron/monthlyRotation'
import { scheduleMonthlyAttendance } from './cron/monthlyAttendance'
import { scheduleMicrosoftCalendarSync } from './cron/microsoftCalendarSync'
import prisma from './lib/prisma'
import { archiveExpiredNotifications } from './services/notificationService'
import { resolveSafeWorkOrderUploadPath } from './services/workOrderService'

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err)
  process.exit(1)
})
// Log but do NOT exit — a single failed Prisma query should not kill the server.
// Routes must use try/catch + next(err) so errors reach the Express error handler.
process.on('unhandledRejection', (reason) => {
  console.error('[WARN] unhandledRejection (server continues):', reason)
})

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())
app.get('/uploads/work-order-templates/:filename', async (req, res, next) => {
  try {
    const upload = resolveSafeWorkOrderUploadPath(req.params.filename)
    if (!upload) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }

    const file = await fs.readFile(upload.filePath)
    res.setHeader('Content-Type', upload.contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(file)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    next(err)
  }
})

app.use('/api/auth', authRouter)
app.use('/api/student', studentsRouter)
app.use('/api/students', studentsRouter)
app.use('/api/teacher', teacherRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/school-wide', schoolwideRouter)
app.use('/api/grades', gradesRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/work-orders', workOrdersRouter)

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// DB connectivity check — useful for Railway diagnostics
app.get('/api/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok' })
  } catch (err) {
    console.error('[HEALTH/DB]', err)
    res.status(503).json({ status: 'error', error: 'Database unreachable' })
  }
})

// Global error handler — catches errors passed via next(err) in async routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

scheduleMonthlyRotation()
scheduleMonthlyAttendance()
scheduleMicrosoftCalendarSync()
archiveExpiredNotifications(prisma)
  .then((count) => {
    if (count > 0) console.log(`[notifications] archived ${count} expired notification(s) on startup`)
  })
  .catch((err) => console.error('[notifications] startup cleanup failed:', err))

app.listen(Number(PORT), '::', () => {
  console.log(`PTTI server running on port ${PORT}`)
})
