import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../src/middleware/requireAuth'

/**
 * Role-based access tests for the video dashboard.
 *
 * These tests verify the requireAuth middleware guards on the videos routes
 * without requiring a database connection. We reconstruct the same route
 * structure as videos.ts but with in-memory storage instead of Prisma.
 *
 * Coverage:
 *  - GET /api/videos is accessible without auth (students can view)
 *  - POST /api/videos requires teacher auth (students cannot create)
 *  - PUT /api/videos/:id requires teacher auth (students cannot update)
 *  - DELETE /api/videos/:id requires teacher auth (students cannot delete)
 *  - PUT /api/videos/reorder requires teacher auth (students cannot reorder)
 *  - A direct student attempt to POST/PUT/DELETE returns 401
 *  - Invalid/expired tokens are rejected
 *  - Persistence and display order are maintained
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

// In-memory video store (mirrors the videos route logic)
const videos: any[] = []
let nextId = 1

function makeVideo(title: string, videoUrl: string, displayOrder: number) {
  const id = `video-${nextId++}`
  const video = {
    id,
    title,
    videoUrl,
    embedUrl: videoUrl.includes('youtu.be')
      ? `https://www.youtube.com/embed/${videoUrl.split('youtu.be/')[1]?.split('?')[0]}`
      : `https://www.youtube.com/embed/${videoUrl.split('watch?v=')[1]?.split('&')[0]}`,
    displayOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: { id: 'teacher-1', name: 'Jane Smith', email: 'jane@ptti.edu' },
    updatedBy: null,
  }
  videos.push(video)
  return video
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // GET /api/videos — public read (no requireAuth)
  app.get('/api/videos', (_req, res) => {
    const sorted = [...videos].sort((a, b) => a.displayOrder - b.displayOrder)
    res.json({ success: true, data: { videos: sorted } })
  })

  // POST /api/videos — teacher-only
  app.post('/api/videos', requireAuth, (req, res) => {
    const { title, videoUrl, displayOrder } = req.body
    if (!title || !title.trim()) {
      res.status(400).json({ success: false, error: 'title is required' })
      return
    }
    if (!videoUrl || !videoUrl.trim()) {
      res.status(400).json({ success: false, error: 'videoUrl is required' })
      return
    }
    const video = makeVideo(title.trim(), videoUrl.trim(), displayOrder ?? videos.length)
    res.status(201).json({ success: true, data: { video } })
  })

  // PUT /api/videos/reorder — teacher-only (must be registered BEFORE /:id)
  app.put('/api/videos/reorder', requireAuth, (req, res) => {
    const updates = req.body.videos
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ success: false, error: 'videos array is required' })
      return
    }
    for (const item of updates) {
      const video = videos.find((v) => v.id === item.id)
      if (video) video.displayOrder = item.displayOrder
    }
    const sorted = [...videos].sort((a, b) => a.displayOrder - b.displayOrder)
    res.json({ success: true, data: { videos: sorted } })
  })

  // PUT /api/videos/:id — teacher-only
  app.put('/api/videos/:id', requireAuth, (req, res) => {
    const video = videos.find((v) => v.id === req.params.id)
    if (!video) {
      res.status(404).json({ success: false, error: 'Video link not found' })
      return
    }
    if (req.body.title) video.title = req.body.title
    if (req.body.videoUrl) video.videoUrl = req.body.videoUrl
    video.updatedAt = new Date().toISOString()
    res.json({ success: true, data: { video } })
  })

  // DELETE /api/videos/:id — teacher-only
  app.delete('/api/videos/:id', requireAuth, (req, res) => {
    const index = videos.findIndex((v) => v.id === req.params.id)
    if (index === -1) {
      res.status(404).json({ success: false, error: 'Video link not found' })
      return
    }
    videos.splice(index, 1)
    res.json({ success: true, data: { id: req.params.id } })
  })

  return app
}

async function listen(app: express.Express) {
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address === 'object')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

function teacherToken(): string {
  return jwt.sign({ teacherId: 'teacher-1', email: 'jane@ptti.edu' }, JWT_SECRET, { expiresIn: '1h' })
}

async function main() {
  // 1. GET /api/videos — public read (no auth required)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const res = await fetch(`${baseUrl}/api/videos`)
      assert.equal(res.status, 200, 'GET /api/videos returns 200 without auth')
      const body = await res.json()
      assert.equal(body.success, true)
      assert.ok(Array.isArray(body.data.videos), 'response has videos array')
      console.log('  1. Public read (no auth): PASS')
    } finally {
      server.close()
    }
  }

  // 2. POST /api/videos — student cannot create (401)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      // No token — simulates student without auth
      const noAuth = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Student Hack', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(noAuth.status, 401, 'POST without auth returns 401')
      const noAuthBody = await noAuth.json()
      assert.equal(noAuthBody.success, false)
      assert.equal(noAuthBody.error, 'Not authenticated')

      // With teacher token — should succeed
      const token = teacherToken()
      const withAuth = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({ title: 'Orientation Video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      assert.equal(withAuth.status, 201, 'POST with teacher auth returns 201')
      const withAuthBody = await withAuth.json()
      assert.equal(withAuthBody.success, true)
      assert.equal(withAuthBody.data.video.title, 'Orientation Video')
      console.log('  2. Teacher-only create (no auth → 401, teacher → 201): PASS')
    } finally {
      server.close()
    }
  }

  // 3. PUT /api/videos/:id — student cannot update (401)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }

      // Create a video first
      const create = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Original', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      const { video } = (await create.json()).data

      // No auth attempt — student trying to edit
      const noAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked' }),
      })
      assert.equal(noAuth.status, 401, 'PUT without auth returns 401')

      // With teacher auth — should succeed
      const withAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ title: 'Updated Title' }),
      })
      assert.equal(withAuth.status, 200, 'PUT with teacher auth returns 200')
      const body = await withAuth.json()
      assert.equal(body.data.video.title, 'Updated Title')
      console.log('  3. Teacher-only update (no auth → 401, teacher → 200): PASS')
    } finally {
      server.close()
    }
  }

  // 4. DELETE /api/videos/:id — student cannot delete (401)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }

      // Create a video
      const create = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'To Delete', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      const { video } = (await create.json()).data

      // No auth — student attempt
      const noAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, { method: 'DELETE' })
      assert.equal(noAuth.status, 401, 'DELETE without auth returns 401')

      // With teacher auth
      const withAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'DELETE',
        headers: { cookie: `token=${token}` },
      })
      assert.equal(withAuth.status, 200, 'DELETE with teacher auth returns 200')

      // Confirm it's gone
      const afterDelete = await fetch(`${baseUrl}/api/videos`)
      const listBody = await afterDelete.json()
      assert.ok(!listBody.data.videos.some((v: any) => v.id === video.id), 'deleted video removed from list')
      console.log('  4. Teacher-only delete (no auth → 401, teacher → 200, item removed): PASS')
    } finally {
      server.close()
    }
  }

  // 5. PUT /api/videos/reorder — student cannot reorder (401)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }
      const ids: string[] = []

      // Create 3 videos
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/videos`, {
          method: 'POST', headers,
          body: JSON.stringify({ title: `Video ${i}`, videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: i }),
        })
        const body = await res.json()
        console.log(`  [test5] create ${i}:`, JSON.stringify(body))
        ids.push(body.data.video.id)
      }
      console.log('  [test5] ids:', ids)

      // No auth — student attempt
      const noAuth = await fetch(`${baseUrl}/api/videos/reorder`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videos: [{ id: ids[0], displayOrder: 2 }, { id: ids[2], displayOrder: 0 }] }),
      })
      assert.equal(noAuth.status, 401, 'PUT /reorder without auth returns 401')

      // With teacher auth
      const withAuth = await fetch(`${baseUrl}/api/videos/reorder`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          videos: [
            { id: ids[2], displayOrder: 0 },
            { id: ids[1], displayOrder: 1 },
            { id: ids[0], displayOrder: 2 },
          ],
        }),
      })
      assert.equal(withAuth.status, 200, 'PUT /reorder with teacher auth returns 200')
      const body = await withAuth.json()
      // Find the 3 newly-created videos in the response and verify their relative order
      const ordered = body.data.videos
      const pos0 = ordered.findIndex((v: any) => v.id === ids[2])
      const pos1 = ordered.findIndex((v: any) => v.id === ids[1])
      const pos2 = ordered.findIndex((v: any) => v.id === ids[0])
      assert.ok(pos0 < pos1, 'ids[2] comes before ids[1] after reorder')
      assert.ok(pos1 < pos2, 'ids[1] comes before ids[0] after reorder')
      console.log('  5. Teacher-only reorder (no auth → 401, teacher → 200, order persisted): PASS')
    } finally {
      server.close()
    }
  }

  // 6. Invalid/expired token is rejected (student impersonation attempt)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const expiredToken = jwt.sign({ teacherId: 't1', email: 'e@e.com' }, JWT_SECRET, { expiresIn: -10 })
      const res = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${expiredToken}` },
        body: JSON.stringify({ title: 'X', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(res.status, 401, 'expired token → 401')

      // Malformed token
      const badToken = 'not.a.real.token'
      const res2 = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${badToken}` },
        body: JSON.stringify({ title: 'Y', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(res2.status, 401, 'malformed token → 401')
      console.log('  6. Invalid/expired token rejected: PASS')
    } finally {
      server.close()
    }
  }

  // 7. Persistence — data survives a fresh GET (simulating reload)
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }
      await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Persistent Video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })

      const reload = await fetch(`${baseUrl}/api/videos`)
      const body = await reload.json()
      const found = body.data.videos.find((v: any) => v.title === 'Persistent Video')
      assert.ok(found, 'video persists after reload')
      console.log('  7. Persistence (video survives fresh GET simulating reload): PASS')
    } finally {
      server.close()
    }
  }

  // 8. Display order is respected in list
  {
    const app = buildApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }
      await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Third', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 2 }),
      })
      await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'First', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Second', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 1 }),
      })

      const res = await fetch(`${baseUrl}/api/videos`)
      const body = await res.json()
      const all = body.data.videos
      const posFirst = all.findIndex((v: any) => v.title === 'First')
      const posSecond = all.findIndex((v: any) => v.title === 'Second')
      const posThird = all.findIndex((v: any) => v.title === 'Third')
      assert.ok(posFirst < posSecond, 'First comes before Second')
      assert.ok(posSecond < posThird, 'Second comes before Third')
      console.log('  8. Display order (videos returned sorted by displayOrder): PASS')
    } finally {
      server.close()
    }
  }

  console.log('\nAll video dashboard role-based tests passed (8/8)')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
