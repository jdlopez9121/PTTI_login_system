import path from 'path'

export const MICROSOFT_GRAPH_SCOPES = ['User.Read', 'Calendars.Read', 'offline_access']
export const DEFAULT_MICROSOFT_CALENDAR_SYNC_CRON = '*/30 * * * *'
export const DEFAULT_MICROSOFT_CALENDAR_TIME_ZONE = 'America/New_York'
export const DEFAULT_MICROSOFT_TOKEN_CACHE_PATH = '.data/msal-token-cache.json'

export type MicrosoftGraphAuthMode = 'delegated_device_code'

export interface MicrosoftCalendarConfigValues {
  authMode: MicrosoftGraphAuthMode
  clientId?: string
  tenantId?: string
  calendarEmail?: string
  timeZone: string
  syncCron: string
  lookbackDays: number
  lookaheadDays: number
  tokenCachePath: string
}

export interface MicrosoftCalendarConfig {
  enabled: boolean
  reasons: string[]
  values: MicrosoftCalendarConfigValues
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function resolveTokenCachePath(value: string | undefined, baseDir: string): string {
  const configured = clean(value) ?? DEFAULT_MICROSOFT_TOKEN_CACHE_PATH
  return path.isAbsolute(configured) ? configured : path.resolve(baseDir, configured)
}

export function getMicrosoftCalendarConfig(
  env: NodeJS.ProcessEnv = process.env,
  baseDir = process.cwd()
): MicrosoftCalendarConfig {
  const authMode = (clean(env.MICROSOFT_GRAPH_AUTH_MODE) ?? 'delegated_device_code') as MicrosoftGraphAuthMode
  const clientId = clean(env.MICROSOFT_GRAPH_CLIENT_ID)
  const tenantId = clean(env.MICROSOFT_GRAPH_TENANT_ID)
  const calendarEmail = clean(env.MICROSOFT_CALENDAR_EMAIL)?.toLowerCase()
  const timeZone = clean(env.MICROSOFT_CALENDAR_TIME_ZONE) ?? DEFAULT_MICROSOFT_CALENDAR_TIME_ZONE
  const syncCron = clean(env.MICROSOFT_CALENDAR_SYNC_CRON) ?? DEFAULT_MICROSOFT_CALENDAR_SYNC_CRON
  const lookbackDays = positiveInteger(env.MICROSOFT_CALENDAR_SYNC_LOOKBACK_DAYS, 1)
  const lookaheadDays = positiveInteger(env.MICROSOFT_CALENDAR_SYNC_LOOKAHEAD_DAYS, 7)
  const tokenCachePath = resolveTokenCachePath(env.MICROSOFT_TOKEN_CACHE_PATH, baseDir)

  const reasons: string[] = []
  if (authMode !== 'delegated_device_code') {
    reasons.push('MICROSOFT_GRAPH_AUTH_MODE must be delegated_device_code for v1')
  }
  if (!clientId) reasons.push('MICROSOFT_GRAPH_CLIENT_ID is required')
  if (!tenantId) reasons.push('MICROSOFT_GRAPH_TENANT_ID is required')
  if (!calendarEmail) reasons.push('MICROSOFT_CALENDAR_EMAIL is required')

  return {
    enabled: reasons.length === 0,
    reasons,
    values: {
      authMode,
      clientId,
      tenantId,
      calendarEmail,
      timeZone,
      syncCron,
      lookbackDays,
      lookaheadDays,
      tokenCachePath,
    },
  }
}

export function describeMicrosoftCalendarConfigIssue(config: MicrosoftCalendarConfig): string {
  if (config.enabled) return 'Microsoft calendar sync is configured.'
  return `Microsoft calendar sync disabled: ${config.reasons.join('; ')}. Configure server/.env and run npm run calendar:login.`
}
