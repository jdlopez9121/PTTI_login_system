import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import cookieParser from 'cookie-parser'
import videosRouter from '../src/routes/videos'

function routeLayer(path: string, method: string) {
  const layer = videosRouter.stack.find((candidate: any) => candidate.route?.path === path && candidate.route?.methods?.[method])
  assert(layer?.route, `${method.toUpperCase()} ${path} route exists`)
  return layer as any
}

async function main() {
  const listRoute = routeLayer('/', 'get')
  assert.equal(
    listRoute.route.stack.some((layer: any) => layer.handle?.name === 'requireAuth'),
    false,
    'GET /api/videos must be readable without teacher auth so student dashboards can fetch videos',
  )

  for (const [path, method] of [['/', 'post'], ['/reorder', 'put'], ['/:id', 'put'], ['/:id', 'delete']] as const) {
    const layer = routeLayer(path, method)
    assert.equal(
      layer.route.stack.some((stackLayer: any) => stackLayer.handle?.name === 'requireAuth'),
      true,
      `${method.toUpperCase()} ${path} requires teacher auth`,
    )
  }

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/videos', videosRouter)
  const server = http.createServer(app)

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    for (const [path, method, body] of [
      ['/api/videos', 'POST', { title: 'x', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }],
      ['/api/videos/reorder', 'PUT', { videos: [{ id: 'video-1', displayOrder: 1 }] }],
      ['/api/videos/video-1', 'PUT', { title: 'Updated' }],
      ['/api/videos/video-1', 'DELETE', undefined],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await response.json()
      assert.equal(response.status, 401, `${method} ${path} returns the standard unauthenticated response`)
      assert.deepEqual(json, { success: false, error: 'Not authenticated' })
    }
  } finally {
    server.close()
  }

  console.log('videos route auth tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
