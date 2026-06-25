import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  buildStudentAssigneeLookup,
  buildStudentTicketSelect,
  buildTicketCreateData,
  normalizeWorkOrderWalkthroughVideoUrl,
  persistWorkOrderTemplateFile,
  validateOneAssignee,
} from '../src/services/workOrderService'

function testValidateOneAssigneeRequiresExactlyOneAssignee() {
  assert.deepStrictEqual(validateOneAssignee({}), {
    ok: false,
    error: 'Exactly one assignee is required',
  })
  assert.deepStrictEqual(validateOneAssignee({ assigneeStudentId: 'student-1', assigneeTeacherId: 'teacher-1' }), {
    ok: false,
    error: 'Assign a work order to either a student or a teacher, not both',
  })
  assert.deepStrictEqual(validateOneAssignee({ assigneeStudentId: 'student-1' }), {
    ok: true,
    assigneeType: 'student',
    assigneeStudentId: 'student-1',
    assigneeTeacherId: null,
  })
  assert.deepStrictEqual(validateOneAssignee({ assigneeTeacherId: 'teacher-1' }), {
    ok: true,
    assigneeType: 'teacher',
    assigneeStudentId: null,
    assigneeTeacherId: 'teacher-1',
  })
}

function testBuildTicketCreateDataSnapshotsTemplateFields() {
  const now = new Date('2026-06-16T12:00:00Z')
  const data = buildTicketCreateData({
    createdById: 'teacher-1',
    title: 'Machine will not start',
    issueDescription: 'V1. The machine did not start up.',
    template: {
      id: 'template-1',
      name: 'Power Off / Machine Did Not Start',
      versionLabel: 'Version 1',
      description: 'Troubleshooting card',
      photoPath: '/uploads/work-order-templates/workOrderExample.png',
      photoUrl: '/uploads/work-order-templates/workOrderExample.png',
      photoMimeType: 'image/png',
      photoSizeBytes: 12345,
      originalFilename: 'workOrderExample.png',
    },
    assignee: {
      assigneeType: 'student',
      assigneeStudentId: 'student-1',
      assigneeTeacherId: null,
    },
    now,
  })

  assert.strictEqual(data.status, 'assigned')
  assert.strictEqual(data.templateId, 'template-1')
  assert.strictEqual(data.templateNameSnapshot, 'Power Off / Machine Did Not Start')
  assert.strictEqual(data.templateVersionSnapshot, 'Version 1')
  assert.strictEqual(data.templatePhotoPathSnapshot, '/uploads/work-order-templates/workOrderExample.png')
  assert.strictEqual(data.assigneeType, 'student')
  assert.strictEqual(data.assigneeStudentId, 'student-1')
  assert.strictEqual(data.assigneeTeacherId, null)
  assert.strictEqual(data.createdById, 'teacher-1')
  assert.strictEqual(data.assignedAt, now)
}

function testBuildStudentAssigneeLookupAllowsPublicStudentId() {
  assert.deepStrictEqual(buildStudentAssigneeLookup({ studentRecordId: 'db-student-1' }), {
    id: 'db-student-1',
    isActive: true,
  })
  assert.deepStrictEqual(buildStudentAssigneeLookup({ publicStudentId: '  S12345  ' }), {
    studentId: 'S12345',
    isActive: true,
  })
}

function testBuildStudentTicketSelectExposesOnlyStudentDashboardFieldsWithoutMessages() {
  const select = buildStudentTicketSelect()

  assert.strictEqual(select.title, true)
  assert.strictEqual(select.issueDescription, true)
  assert.strictEqual(select.workPerformed, true)
  assert.strictEqual(select.status, true)

  assert.strictEqual(Object.prototype.hasOwnProperty.call(select, 'messages'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(select, 'notifications'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(select, 'createdBy'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(select, 'assigneeTeacher'), false)
}

async function testStudentRoutesDoNotExposeChatMutationEndpoints() {
  const routeSource = await fs.readFile(path.resolve(__dirname, '../src/routes/workOrders.ts'), 'utf8')

  assert.strictEqual(routeSource.includes("/student/:studentId/tickets/:ticketId/comments"), false)
  assert.strictEqual(routeSource.includes("/student/:studentId/tickets/:ticketId/close"), false)
  assert.strictEqual(routeSource.includes('finalComment'), false)
  assert.strictEqual(routeSource.includes('buildStudentCommentCreateData'), false)
}

function testNormalizeWalkthroughVideoUrlAcceptsEmbeddableProviders() {
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    ok: true,
    originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    provider: 'youtube',
  })
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=42'), {
    ok: true,
    originalUrl: 'https://youtu.be/dQw4w9WgXcQ?t=42',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    provider: 'youtube',
  })
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('https://vimeo.com/123456789'), {
    ok: true,
    originalUrl: 'https://vimeo.com/123456789',
    embedUrl: 'https://player.vimeo.com/video/123456789',
    provider: 'vimeo',
  })
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('https://training.example.edu/embed/safety-lesson'), {
    ok: true,
    originalUrl: 'https://training.example.edu/embed/safety-lesson',
    embedUrl: 'https://training.example.edu/embed/safety-lesson',
    provider: 'embed',
  })
}

function testNormalizeWalkthroughVideoUrlRejectsNonEmbedUrls() {
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('not a url'), {
    ok: false,
    error: 'Enter a valid http(s) video URL',
  })
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('https://example.com/video/not-embeddable'), {
    ok: false,
    error: 'Enter a YouTube, Vimeo, or /embed/ video URL',
  })
  assert.deepStrictEqual(normalizeWorkOrderWalkthroughVideoUrl('javascript:alert(1)'), {
    ok: false,
    error: 'Enter a valid http(s) video URL',
  })
}

async function testTeacherRoutesExposeWalkthroughVideoManagementOnlyToTeachers() {
  const routeSource = await fs.readFile(path.resolve(__dirname, '../src/routes/workOrders.ts'), 'utf8')

  assert.ok(routeSource.includes("router.get('/walkthrough-videos', requireAuth"))
  assert.ok(routeSource.includes("router.post('/walkthrough-videos', requireAuth"))
  assert.ok(routeSource.includes("router.put('/walkthrough-videos/:id', requireAuth"))
  assert.ok(routeSource.includes("router.delete('/walkthrough-videos/:id', requireAuth"))
  assert.strictEqual(routeSource.includes('/student/:studentId/walkthrough-videos'), false)
  assert.strictEqual(routeSource.includes('/student/:studentId/videos'), false)
}

async function testWorkOrderSchemaDefinesWalkthroughVideoPersistence() {
  const schemaSource = await fs.readFile(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8')

  assert.ok(schemaSource.includes('model WorkOrderWalkthroughVideo'))
  assert.ok(schemaSource.includes('teacherId'))
  assert.ok(schemaSource.includes('@map("work_order_walkthrough_videos")'))
  assert.ok(schemaSource.includes('embedUrl'))
  assert.ok(schemaSource.includes('provider'))
}

async function testClientWorkOrderDashboardRendersWalkthroughVideosViewport() {
  const dashboardSource = await fs.readFile(path.resolve(__dirname, '../../client/src/components/WorkOrderDashboard.tsx'), 'utf8')
  const panelSource = await fs.readFile(path.resolve(__dirname, '../../client/src/components/WorkOrderWalkthroughVideosPanel.tsx'), 'utf8')

  assert.ok(dashboardSource.includes('WorkOrderWalkthroughVideosPanel'))
  assert.ok(panelSource.includes('Walkthrough Videos'))
  assert.ok(panelSource.includes('Add Video'))
  assert.ok(panelSource.includes('iframe'))
  assert.ok(panelSource.includes('deleteWorkOrderWalkthroughVideo'))
}

async function testClientWorkOrderDashboardRendersStudentVideoWalkthroughViewport() {
  const dashboardSource = await fs.readFile(path.resolve(__dirname, '../../client/src/components/WorkOrderDashboard.tsx'), 'utf8')
  const panelSource = await fs.readFile(path.resolve(__dirname, '../../client/src/components/StudentWalkthroughVideosPanel.tsx'), 'utf8')

  assert.ok(dashboardSource.includes('StudentWalkthroughVideosPanel'))
  assert.ok(panelSource.includes('Student Video Walkthroughs'))
  assert.ok(panelSource.includes('Student-viewable'))
  assert.ok(panelSource.includes('Add Video'))
  assert.ok(panelSource.includes('iframe'))
  assert.ok(panelSource.includes('deleteWorkOrderStudentVideo'))
}

async function testStudentVideoRoutesArePublicForGetButTeacherAuthForMutations() {
  const routeSource = await fs.readFile(path.resolve(__dirname, '../src/routes/workOrders.ts'), 'utf8')

  assert.ok(routeSource.includes("router.get('/student-walkthrough-videos'"))
  assert.ok(routeSource.includes("router.post('/student-walkthrough-videos', requireAuth"))
  assert.ok(routeSource.includes("router.put('/student-walkthrough-videos/:id', requireAuth"))
  assert.ok(routeSource.includes("router.delete('/student-walkthrough-videos/:id', requireAuth"))

  const getLine = routeSource.split('\n').find((line) => line.includes("router.get('/student-walkthrough-videos'"))
  assert.ok(getLine !== undefined)
  assert.strictEqual(getLine!.includes('requireAuth'), false, 'GET student-walkthrough-videos must not require auth')
}

async function testWorkOrderSchemaDefinesStudentVideoPersistence() {
  const schemaSource = await fs.readFile(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8')

  assert.ok(schemaSource.includes('model WorkOrderStudentVideo'))
  assert.ok(schemaSource.includes('@map("work_order_student_videos")'))
  assert.ok(schemaSource.includes('embedUrl'))
  assert.ok(schemaSource.includes('provider'))
}

async function testStudentWorkOrderPanelShowsStudentVideos() {
  const panelSource = await fs.readFile(path.resolve(__dirname, '../../client/src/components/StudentWorkOrderPanel.tsx'), 'utf8')

  assert.ok(panelSource.includes('getWorkOrderStudentVideos'))
  assert.ok(panelSource.includes('walkthroughVideos'))
  assert.ok(panelSource.includes('Video Walkthroughs'))
  assert.ok(panelSource.includes('iframe'))
}

async function testPersistWorkOrderTemplateFileStoresVerifiedTypeExtension() {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'work-order-upload-'))
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ])

  const stored = await persistWorkOrderTemplateFile({
    buffer: pngBytes,
    originalFilename: '../../dangerous-template.html',
    mimeType: 'image/jpeg',
    uploadDir,
  })

  assert.strictEqual(stored.mimeType, 'image/png')
  assert.strictEqual(stored.originalFilename, 'dangerous-template.html')
  assert.strictEqual(path.extname(stored.storedPath), '.png')
  assert.match(path.basename(stored.storedPath), /^\d+-dangerous-template\.png$/)
  assert.match(stored.url, /^\/uploads\/work-order-templates\/\d+-dangerous-template\.png$/)
  assert.strictEqual(await fs.readFile(stored.storedPath, 'hex'), pngBytes.toString('hex'))
}

async function testPersistWorkOrderTemplateFileRejectsSpoofedNonImageUpload() {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'work-order-upload-'))

  await assert.rejects(
    persistWorkOrderTemplateFile({
      buffer: Buffer.from('<!doctype html><script>alert(1)</script>'),
      originalFilename: 'payload.png',
      mimeType: 'image/png',
      uploadDir,
    }),
    /photo must be a PNG, JPEG, WebP, or GIF image/,
  )
}

async function run() {
  testValidateOneAssigneeRequiresExactlyOneAssignee()
  testBuildTicketCreateDataSnapshotsTemplateFields()
  testBuildStudentAssigneeLookupAllowsPublicStudentId()
  testBuildStudentTicketSelectExposesOnlyStudentDashboardFieldsWithoutMessages()
  await testStudentRoutesDoNotExposeChatMutationEndpoints()
  testNormalizeWalkthroughVideoUrlAcceptsEmbeddableProviders()
  testNormalizeWalkthroughVideoUrlRejectsNonEmbedUrls()
  await testTeacherRoutesExposeWalkthroughVideoManagementOnlyToTeachers()
  await testWorkOrderSchemaDefinesWalkthroughVideoPersistence()
  await testClientWorkOrderDashboardRendersWalkthroughVideosViewport()
  await testClientWorkOrderDashboardRendersStudentVideoWalkthroughViewport()
  await testStudentVideoRoutesArePublicForGetButTeacherAuthForMutations()
  await testWorkOrderSchemaDefinesStudentVideoPersistence()
  await testStudentWorkOrderPanelShowsStudentVideos()
  await testPersistWorkOrderTemplateFileStoresVerifiedTypeExtension()
  await testPersistWorkOrderTemplateFileRejectsSpoofedNonImageUpload()
  console.log('workOrderService tests passed')
}

void run()
