import assert from 'assert'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  buildStudentAssigneeLookup,
  buildStudentTicketSelect,
  buildTicketCreateData,
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
  await testPersistWorkOrderTemplateFileStoresVerifiedTypeExtension()
  await testPersistWorkOrderTemplateFileRejectsSpoofedNonImageUpload()
  console.log('workOrderService tests passed')
}

void run()
