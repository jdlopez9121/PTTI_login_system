import fs from 'fs/promises'
import path from 'path'
import { PublicClientApplication, type AccountInfo, type AuthenticationResult, type Configuration } from '@azure/msal-node'
import { MICROSOFT_GRAPH_SCOPES, type MicrosoftCalendarConfig } from '../config/microsoftCalendarConfig'

export class MicrosoftGraphAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MicrosoftGraphAuthError'
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export async function createMicrosoftPublicClient(config: MicrosoftCalendarConfig): Promise<PublicClientApplication> {
  if (!config.enabled || !config.values.clientId || !config.values.tenantId) {
    throw new MicrosoftGraphAuthError(`Microsoft Graph auth is not configured: ${config.reasons.join('; ')}`)
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: config.values.clientId,
      authority: `https://login.microsoftonline.com/${config.values.tenantId}`,
    },
  }
  const client = new PublicClientApplication(msalConfig)

  try {
    const serializedCache = await fs.readFile(config.values.tokenCachePath, 'utf8')
    client.getTokenCache().deserialize(serializedCache)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }

  return client
}

export async function saveMicrosoftTokenCache(client: PublicClientApplication, tokenCachePath: string): Promise<void> {
  await ensureParentDir(tokenCachePath)
  await fs.writeFile(tokenCachePath, client.getTokenCache().serialize(), { mode: 0o600 })
}

export async function loginWithDeviceCode(config: MicrosoftCalendarConfig): Promise<{ account: AccountInfo; result: AuthenticationResult }> {
  const client = await createMicrosoftPublicClient(config)
  const result = await client.acquireTokenByDeviceCode({
    scopes: MICROSOFT_GRAPH_SCOPES,
    deviceCodeCallback: (response) => {
      console.log(response.message)
    },
  })

  if (!result?.account) {
    throw new MicrosoftGraphAuthError('Microsoft device-code login did not return an account.')
  }
  await saveMicrosoftTokenCache(client, config.values.tokenCachePath)
  return { account: result.account, result }
}

export async function acquireMicrosoftGraphToken(config: MicrosoftCalendarConfig): Promise<string> {
  const client = await createMicrosoftPublicClient(config)
  const accounts = await client.getTokenCache().getAllAccounts()
  const account = accounts[0]
  if (!account) {
    throw new MicrosoftGraphAuthError(`No Microsoft account is stored in ${config.values.tokenCachePath}. Run npm run calendar:login first.`)
  }

  const result = await client.acquireTokenSilent({ account, scopes: MICROSOFT_GRAPH_SCOPES })
  if (!result?.accessToken) throw new MicrosoftGraphAuthError('Microsoft Graph token acquisition failed.')
  await saveMicrosoftTokenCache(client, config.values.tokenCachePath)
  return result.accessToken
}
