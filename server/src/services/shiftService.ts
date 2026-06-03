import { Shift, Track } from '@prisma/client'

interface ShiftDefinition {
  shift: Shift
  // Official class start (displayed to students)
  officialStartHour: number
  officialStartMin: number
  // Detection window start = 5 min before official start
  detectStartHour: number
  detectStartMin: number
  // Detection window end = display transition (5 min before next shift)
  detectEndHour: number
  detectEndMin: number
  // Login cutoff = 2.5 hours (150 min) after official start
  cutoffHour: number
  cutoffMin: number
  durationHours: number
  label: string
}

const SHIFTS: ShiftDefinition[] = [
  {
    shift: 'morning',
    officialStartHour: 8,  officialStartMin: 0,
    detectStartHour: 7,    detectStartMin: 55,
    detectEndHour: 11,     detectEndMin: 25,
    cutoffHour: 10,        cutoffMin: 30,   // 8:00 + 2:30
    durationHours: 4,
    label: '8:00 AM',
  },
  {
    shift: 'afternoon',
    officialStartHour: 11, officialStartMin: 30,
    detectStartHour: 11,   detectStartMin: 25,
    detectEndHour: 14,     detectEndMin: 55,
    cutoffHour: 14,        cutoffMin: 0,    // 11:30 + 2:30
    durationHours: 4,
    label: '11:30 AM',
  },
  {
    shift: 'evening',
    officialStartHour: 15, officialStartMin: 0,
    detectStartHour: 14,   detectStartMin: 55,
    detectEndHour: 18,     detectEndMin: 24,  // ends 1 min before night detection opens
    cutoffHour: 17,        cutoffMin: 30,   // 3:00 + 2:30
    durationHours: 4,
    label: '3:00 PM',
  },
  {
    shift: 'night',
    officialStartHour: 18, officialStartMin: 30,
    detectStartHour: 18,   detectStartMin: 25,
    detectEndHour: 23,     detectEndMin: 0,
    cutoffHour: 21,        cutoffMin: 30,   // 6:30 + 3:00
    durationHours: 4,
    label: '6:30 PM',
  },
]

function toMinutes(hour: number, min: number): number {
  return hour * 60 + min
}

// Classify a date into a shift based on the detection window
export function classifyByTime(date: Date): Shift | null {
  const totalMin = date.getHours() * 60 + date.getMinutes()
  for (const s of SHIFTS) {
    const start = toMinutes(s.detectStartHour, s.detectStartMin)
    const end   = toMinutes(s.detectEndHour, s.detectEndMin)
    if (totalMin >= start && totalMin <= end) return s.shift
  }
  return null
}

export interface LoginValidation {
  allowed: true
  shift: Shift
  warning?: string
}

// Students can ALWAYS log in. If within the normal window, no warning.
// If outside the normal window (past cutoff or between shifts), still allowed
// but a warning is returned so the UI can display it.
export function validateLoginTime(localHour: number, localMin: number): LoginValidation {
  const totalMin = toMinutes(localHour, localMin)

  for (const s of SHIFTS) {
    const earlyOpen  = toMinutes(s.detectStartHour, s.detectStartMin)
    const cutoff     = toMinutes(s.cutoffHour, s.cutoffMin)
    const detectEnd  = toMinutes(s.detectEndHour, s.detectEndMin)

    // Within the detection window for this shift
    if (totalMin >= earlyOpen && totalMin <= detectEnd) {
      if (totalMin <= cutoff) {
        // Normal window — no warning
        return { allowed: true, shift: s.shift }
      } else {
        // Past cutoff but still in detection window — warn
        return {
          allowed: true,
          shift: s.shift,
          warning: `You are clocked in, but you are outside your ${s.shift} shift window (${s.label} + 2.5 hrs). Please see your teacher if you have questions.`,
        }
      }
    }
  }

  // Outside all shift detection windows — assign to nearest shift and warn
  const nearest = findNearestShift(totalMin)
  return {
    allowed: true,
    shift: nearest,
    warning: `No active class at this time. Clocked in, but you are outside your scheduled time window.`,
  }
}

function findNearestShift(totalMin: number): Shift {
  // Before first shift opens → morning
  if (totalMin < toMinutes(SHIFTS[0].detectStartHour, SHIFTS[0].detectStartMin)) {
    return 'morning'
  }
  // After last shift ends → night
  const last = SHIFTS[SHIFTS.length - 1]
  if (totalMin > toMinutes(last.detectEndHour, last.detectEndMin)) {
    return 'night'
  }
  // In a gap between shifts — return the shift whose detection window just ended
  for (let i = 0; i < SHIFTS.length - 1; i++) {
    const endOfCurrent = toMinutes(SHIFTS[i].detectEndHour, SHIFTS[i].detectEndMin)
    const startOfNext  = toMinutes(SHIFTS[i + 1].detectStartHour, SHIFTS[i + 1].detectStartMin)
    if (totalMin > endOfCurrent && totalMin < startOfNext) {
      return SHIFTS[i].shift
    }
  }
  return 'morning'
}

// hours_credited = shift duration + 1 (legacy administrative behavior — do not remove)
export function hoursCredited(shift: Shift): number {
  const def = SHIFTS.find((s) => s.shift === shift)
  return (def?.durationHours ?? 4) + 1
}

export function trackFromShift(shift: Shift): Track {
  return shift === 'morning' || shift === 'afternoon' ? 'day' : 'night'
}

export const SHIFT_SCHEDULE = SHIFTS.map((s) => ({
  shift: s.shift,
  label: s.label,
  cutoff: `${s.cutoffHour}:${String(s.cutoffMin).padStart(2, '0')}`,
}))
