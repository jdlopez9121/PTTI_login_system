import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRouter from './routes/auth'
import studentsRouter from './routes/students'
import teacherRouter from './routes/teacher'
import roomsRouter from './routes/rooms'
import schoolwideRouter from './routes/schoolwide'
import { scheduleMonthlyRotation } from './cron/monthlyRotation'

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason)
  process.exit(1)
})

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/student', studentsRouter)
app.use('/api/students', studentsRouter)
app.use('/api/teacher', teacherRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/school-wide', schoolwideRouter)

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Global error handler — catches errors passed via next(err) in async routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

scheduleMonthlyRotation()

app.listen(Number(PORT), '::', () => {
  console.log(`PTTI server running on port ${PORT}`)
})
