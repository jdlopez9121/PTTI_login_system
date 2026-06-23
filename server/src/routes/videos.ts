import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/requireAuth'
import {
  normalizeVideoLinkInput,
  normalizeVideoLinkPatch,
  toVideoLinkResponse,
  VideoLinkRecord,
} from '../services/videoLinkService'

const router = Router()

const teacherSelect = { id: true, name: true, email: true }
const videoInclude = {
  createdByTeacher: { select: teacherSelect },
  updatedByTeacher: { select: teacherSelect },
}

// GET /api/videos — public read for student and teacher dashboards.
router.get('/', async (_req: Request, res: Response) => {
  const videos = await prisma.videoLink.findMany({
    include: videoInclude,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  res.json({
    success: true,
    data: { videos: videos.map((video) => toVideoLinkResponse(video as VideoLinkRecord)) },
  })
})

// POST /api/videos — teacher-only create.
router.post('/', requireAuth, async (req: Request, res: Response) => {
  let input
  try {
    input = normalizeVideoLinkInput(req.body)
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid video link input' })
    return
  }

  const video = await prisma.videoLink.create({
    data: {
      ...input,
      createdBy: req.teacher!.teacherId,
    },
    include: videoInclude,
  })

  res.status(201).json({ success: true, data: { video: toVideoLinkResponse(video as VideoLinkRecord) } })
})

// PUT /api/videos/reorder — teacher-only batch reorder.
router.put('/reorder', requireAuth, async (req: Request, res: Response) => {
  const videos = (req.body as { videos?: unknown }).videos
  if (!Array.isArray(videos) || videos.length === 0) {
    res.status(400).json({ success: false, error: 'videos array is required' })
    return
  }

  const updates: Array<{ id: string; displayOrder: number }> = []
  for (const item of videos) {
    const { id, displayOrder } = item as { id?: unknown; displayOrder?: unknown }
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ success: false, error: 'Each reorder item requires an id' })
      return
    }
    if (displayOrder === undefined || displayOrder === null || displayOrder === '') {
      res.status(400).json({ success: false, error: 'Each reorder item requires a displayOrder' })
      return
    }
    try {
      updates.push({ id: id.trim(), displayOrder: normalizeVideoLinkPatch({ displayOrder }).displayOrder! })
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid displayOrder' })
      return
    }
  }

  try {
    await prisma.$transaction(
      updates.map(({ id, displayOrder }) => prisma.videoLink.update({
        where: { id },
        data: { displayOrder, updatedBy: req.teacher!.teacherId },
      })),
    )
  } catch {
    res.status(404).json({ success: false, error: 'One or more video links were not found' })
    return
  }

  const orderedVideos = await prisma.videoLink.findMany({
    include: videoInclude,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  res.json({ success: true, data: { videos: orderedVideos.map((video) => toVideoLinkResponse(video as VideoLinkRecord)) } })
})

// PUT /api/videos/:id — teacher-only update.
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  let input
  try {
    input = normalizeVideoLinkPatch(req.body)
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Invalid video link input' })
    return
  }

  try {
    const video = await prisma.videoLink.update({
      where: { id: req.params.id },
      data: {
        ...input,
        updatedBy: req.teacher!.teacherId,
      },
      include: videoInclude,
    })

    res.json({ success: true, data: { video: toVideoLinkResponse(video as VideoLinkRecord) } })
  } catch {
    res.status(404).json({ success: false, error: 'Video link not found' })
  }
})

// DELETE /api/videos/:id — teacher-only delete.
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.videoLink.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch {
    res.status(404).json({ success: false, error: 'Video link not found' })
  }
})

export default router
