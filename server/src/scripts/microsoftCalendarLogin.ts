import { getMicrosoftCalendarConfig } from '../config/microsoftCalendarConfig'
import { loginWithDeviceCode } from '../services/microsoftGraphAuth'

async function graphGet(accessToken: string, url: string): Promise<any> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Microsoft Graph check failed (${response.status}): ${body}`)
  }
  return response.json()
}

async function run() {
  const config = getMicrosoftCalendarConfig()
  if (!config.enabled) {
    console.error(`Microsoft calendar login cannot start: ${config.reasons.join('; ')}`)
    console.error('Add Microsoft calendar values to server/.env first. See server/docs/microsoft-calendar-setup.md.')
    process.exit(1)
  }

  console.log('Starting Microsoft device-code login for PTTI Teacher Dashboard calendar sync...')
  const { account, result } = await loginWithDeviceCode(config)
  const me = await graphGet(result.accessToken, 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName')
  await graphGet(result.accessToken, 'https://graph.microsoft.com/v1.0/me/calendar?$select=id,name')

  console.log(`Signed in as ${me.mail ?? me.userPrincipalName ?? account.username}.`)
  console.log(`Token cache saved to ${config.values.tokenCachePath}.`)
  console.log('Calendar access check succeeded: found default calendar.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
