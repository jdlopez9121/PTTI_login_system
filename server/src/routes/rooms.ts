import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()

// GET /api/rooms — list all rooms (no auth; needed for main login page dropdown)
router.get('/', async (_req: Request, res: Response) => {
  const rooms = await prisma.room.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  res.json({ success: true, data: rooms })
})

// POST /api/rooms — create new room (teacher auth only)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name } = req.body as { name: string }
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'Room name is required' })
    return
  }

  const existing = await prisma.room.findUnique({ where: { name: name.trim() } })
  if (existing) {
    res.status(409).json({ success: false, error: 'A room with this name already exists' })
    return
  }

  const room = await prisma.room.create({
    data: { name: name.trim(), createdBy: req.teacher!.teacherId },
  })

  res.status(201).json({ success: true, data: room })
})

export default router
