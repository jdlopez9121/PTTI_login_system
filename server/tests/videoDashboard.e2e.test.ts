import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import videosRouter from '../src/routes/videos'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/videos', videosRouter)
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
  // 1. GET /api/videos — public read (no auth)
  {
    const app = makeApp()
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

  // 2. POST /api/videos — requires teacher auth
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const noAuth = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Test', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(noAuth.status, 401, 'POST without auth returns 401')
      const noAuthBody = await noAuth.json()
      assert.equal(noAuthBody.success, false)

      const token = teacherToken()
      const withAuth = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({ title: 'Orientation Video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      assert.equal(withAuth.status, 201, 'POST with auth returns 201')
      const withAuthBody = await withAuth.json()
      assert.equal(withAuthBody.success, true)
      assert.equal(withAuthBody.data.video.title, 'Orientation Video')
      assert.equal(withAuthBody.data.video.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')
      assert.equal(withAuthBody.data.video.videoUrl, 'https://youtu.be/dQw4w9WgXcQ')
      assert.ok(withAuthBody.data.video.id, 'video has an id')
      assert.ok(withAuthBody.data.video.createdAt, 'video has createdAt')
      assert.equal(withAuthBody.data.video.createdBy.name, 'Jane Smith', 'createdBy includes teacher name')
      console.log('  2. Teacher-only create (with auth → 201, without → 401): PASS')
    } finally {
      server.close()
    }
  }

  // 3. PUT /api/videos/:id — teacher-only update
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const create = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({ title: 'Original', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      const { video } = (await create.json()).data

      const noAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      })
      assert.equal(noAuth.status, 401, 'PUT without auth returns 401')

      const withAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({ title: 'Updated Title' }),
      })
      assert.equal(withAuth.status, 200, 'PUT with auth returns 200')
      const body = await withAuth.json()
      assert.equal(body.data.video.title, 'Updated Title')
      assert.ok(body.data.video.updatedBy, 'updatedBy is set after update')
      console.log('  3. Teacher-only update (with auth → 200, without → 401): PASS')
    } finally {
      server.close()
    }
  }

  // 4. DELETE /api/videos/:id — teacher-only delete
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const create = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({ title: 'To Delete', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: 0 }),
      })
      const { video } = (await create.json()).data

      const noAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, { method: 'DELETE' })
      assert.equal(noAuth.status, 401, 'DELETE without auth returns 401')

      const withAuth = await fetch(`${baseUrl}/api/videos/${video.id}`, {
        method: 'DELETE',
        headers: { cookie: `token=${token}` },
      })
      assert.equal(withAuth.status, 200, 'DELETE with auth returns 200')

      const afterDelete = await fetch(`${baseUrl}/api/videos`)
      const listBody = await afterDelete.json()
      assert.ok(!listBody.data.videos.some((v: any) => v.id === video.id), 'deleted video no longer in list')
      console.log('  4. Teacher-only delete (with auth → 200, without → 401, item removed): PASS')
    } finally {
      server.close()
    }
  }

  // 5. PUT /api/videos/reorder — teacher-only reorder
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/videos`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `token=${token}` },
          body: JSON.stringify({ title: `Video ${i}`, videoUrl: 'https://youtu.be/dQw4w9WgXcQ', displayOrder: i }),
        })
        const body = await res.json()
        ids.push(body.data.video.id)
      }

      const noAuth = await fetch(`${baseUrl}/api/videos/reorder`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videos: [{ id: ids[0], displayOrder: 2 }, { id: ids[2], displayOrder: 0 }] }),
      })
      assert.equal(noAuth.status, 401, 'PUT /reorder without auth returns 401')

      const withAuth = await fetch(`${baseUrl}/api/videos/reorder`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: `token=${token}` },
        body: JSON.stringify({
          videos: [
            { id: ids[2], displayOrder: 0 },
            { id: ids[1], displayOrder: 1 },
            { id: ids[0], displayOrder: 2 },
          ],
        }),
      })
      assert.equal(withAuth.status, 200, 'PUT /reorder with auth returns 200')
      const body = await withAuth.json()
      assert.equal(body.data.videos[0].id, ids[2], 'first video is now ids[2]')
      assert.equal(body.data.videos[1].id, ids[1], 'second video is ids[1]')
      assert.equal(body.data.videos[2].id, ids[0], 'third video is ids[0]')
      console.log('  5. Teacher-only reorder (with auth → 200, without → 401, order persisted): PASS')
    } finally {
      server.close()
    }
  }

  // 6. Input validation — bad data is rejected
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }

      const emptyTitle = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: '', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(emptyTitle.status, 400, 'empty title → 400')

      const badUrl = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Test', videoUrl: 'not-a-url' }),
      })
      assert.equal(badUrl.status, 400, 'bad URL → 400')

      const iframe = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'XSS', videoUrl: '<iframe src="evil"></iframe>' }),
      })
      assert.equal(iframe.status, 400, 'iframe injection → 400')

      const unsupported = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Bad', videoUrl: 'https://example.com/video' }),
      })
      assert.equal(unsupported.status, 400, 'unsupported provider → 400')

      const tooLong = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'x'.repeat(121), videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(tooLong.status, 400, 'title > 120 chars → 400')

      console.log('  6. Input validation (empty title, bad URL, iframe, unsupported, too long → 400): PASS')
    } finally {
      server.close()
    }
  }

  // 7. Embed URL generation — YouTube and Vimeo variants
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const token = teacherToken()
      const headers = { 'content-type': 'application/json', cookie: `token=${token}` }

      const yt1 = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'YT1', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      })
      const b1 = await yt1.json()
      assert.equal(b1.data.video.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')

      const yt2 = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'YT2', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      const b2 = await yt2.json()
      assert.equal(b2.data.video.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')

      const yt3 = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'YT3', videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }),
      })
      const b3 = await yt3.json()
      assert.equal(b3.data.video.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')

      const vimeo = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Vimeo', videoUrl: 'https://vimeo.com/123456789' }),
      })
      const bv = await vimeo.json()
      assert.equal(bv.data.video.embedUrl, 'https://player.vimeo.com/video/123456789')

      const vimeo2 = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: 'Vimeo2', videoUrl: 'https://player.vimeo.com/video/123456789' }),
      })
      const bv2 = await vimeo2.json()
      assert.equal(bv2.data.video.embedUrl, 'https://player.vimeo.com/video/123456789')

      console.log('  7. Embed URL generation (YouTube watch/short/embed, Vimeo standard/player): PASS')
    } finally {
      server.close()
    }
  }

  // 8. Persistence — data survives a fresh GET (simulating reload)
  {
    const app = makeApp()
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
      assert.equal(found.embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')
      console.log('  8. Persistence (video survives fresh GET simulating reload): PASS')
    } finally {
      server.close()
    }
  }

  // 9. Display order is respected in list
  {
    const app = makeApp()
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
      assert.equal(body.data.videos[0].title, 'First')
      assert.equal(body.data.videos[1].title, 'Second')
      assert.equal(body.data.videos[2].title, 'Third')
      console.log('  9. Display order (videos returned sorted by displayOrder): PASS')
    } finally {
      server.close()
    }
  }

  // 10. Invalid/expired token is rejected
  {
    const app = makeApp()
    const { server, baseUrl } = await listen(app)
    try {
      const expiredToken = jwt.sign({ teacherId: 't1', email: 'e@e.com' }, JWT_SECRET, { expiresIn: -10 })
      const res = await fetch(`${baseUrl}/api/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `token=${expiredToken}` },
        body: JSON.stringify({ title: 'X', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      })
      assert.equal(res.status, 401, 'expired token → 401')
      console.log('  10. Expired token rejected: PASS')
    } finally {
      server.close()
    }
  }

  console.log('\nAll video dashboard API integration tests passed (10/10)')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
