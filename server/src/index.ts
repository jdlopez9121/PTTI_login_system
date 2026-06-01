import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRouter from './routes/auth'
import studentsRouter from './routes/students'
import teacherRouter from './routes/teacher'
import roomsRouter from './routes/rooms'
import schoolwideRouter from './routes/schoolwide'
import { scheduleMonthlyRotation } from './cron/monthlyRotation'

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

scheduleMonthlyRotation()

app.listen(PORT, () => {
  console.log(`PTTI server running on http://localhost:${PORT}`)
})
