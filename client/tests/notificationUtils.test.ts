import assert from 'node:assert/strict'
import {
  canArchiveNotification,
  formatNotificationSource,
  formatTimeRemaining,
  notificationAudienceLabel,
  priorityBadgeClass,
} from '../src/utils/notificationUtils'

function testFormatsSourceLabels() {
  assert.equal(formatNotificationSource('manual'), 'Teacher')
  assert.equal(formatNotificationSource('calendar'), 'Calendar')
  assert.equal(formatNotificationSource('email'), 'Email')
}

function testFormatsTimeRemainingUntilExpiry() {
  const now = new Date('2026-06-16T12:00:00.000Z')
  assert.equal(formatTimeRemaining('2026-06-18T11:00:00.000Z', now), '47h remaining')
  assert.equal(formatTimeRemaining('2026-06-16T13:30:00.000Z', now), '1h 30m remaining')
  assert.equal(formatTimeRemaining('2026-06-16T12:20:00.000Z', now), '20m remaining')
  assert.equal(formatTimeRemaining('2026-06-16T11:59:00.000Z', now), 'Expired')
  assert.equal(formatTimeRemaining(null, now), 'No expiry')
}

function testArchiveSemantics() {
  assert.equal(canArchiveNotification({ source: 'manual', createdById: 'teacher-1' }, 'teacher-1'), true)
  assert.equal(canArchiveNotification({ source: 'manual', createdById: 'teacher-1' }, 'teacher-2'), false)
  assert.equal(canArchiveNotification({ source: 'manual', createdById: null }, 'teacher-2'), true)
  assert.equal(canArchiveNotification({ source: 'calendar', createdById: null }, 'teacher-2'), true)
}

function testAudienceLabels() {
  assert.equal(notificationAudienceLabel({ audience: 'all' }), 'All teachers')
  assert.equal(notificationAudienceLabel({ audience: 'subject', subject: 'PLC 1' }), 'Subject: PLC 1')
  assert.equal(notificationAudienceLabel({ audience: 'shift', shift: 'morning' }), 'Shift: morning')
  assert.equal(notificationAudienceLabel({ audience: 'room', roomName: 'Lab A' }), 'Room: Lab A')
}

function testPriorityBadgeClass() {
  assert.equal(priorityBadgeClass('normal'), 'badge-gray')
  assert.equal(priorityBadgeClass('important'), 'badge-blue')
  assert.equal(priorityBadgeClass('urgent'), 'badge-red')
}

testFormatsSourceLabels()
testFormatsTimeRemainingUntilExpiry()
testArchiveSemantics()
testAudienceLabels()
testPriorityBadgeClass()
console.log('notificationUtils tests passed')
