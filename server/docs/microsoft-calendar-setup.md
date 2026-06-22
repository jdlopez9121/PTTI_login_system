# Microsoft 365 Calendar Sync Setup

This sync creates Teacher Dashboard notifications from Microsoft 365 / Outlook Calendar events through Microsoft Graph.

Security rules:

- Do not paste or store a Microsoft password in this app, Hermes, or Kanban.
- Sign in with the local device-code command below.
- Keep `server/.env` and `.data/msal-token-cache.json` out of git.

## 1. Pick the calendar account

Choose the account/calendar that should drive Teacher Dashboard notifications. A shared mailbox or dedicated calendar account is best.

Set this in `server/.env`:

```bash
MICROSOFT_CALENDAR_EMAIL="calendar-account@your-school.edu"
```

## 2. Create a Microsoft Entra app registration

In Microsoft Entra admin center:

1. Open App registrations.
2. Create a new registration named `PTTI Teacher Dashboard Calendar Sync`.
3. Choose the school tenant account type.
4. Redirect URI is not required for the device-code flow.
5. Copy the Application/client ID and Directory/tenant ID.

## 3. Enable public client/device-code flow

In the app registration, open Authentication and enable public client flows / device-code flow.

## 4. Add delegated Microsoft Graph permissions

Add these delegated permissions:

```text
User.Read
Calendars.Read
offline_access
```

If the tenant requires admin consent, ask the Microsoft 365 admin to grant consent.

## 5. Configure `server/.env`

```bash
MICROSOFT_GRAPH_AUTH_MODE=delegated_device_code
MICROSOFT_GRAPH_CLIENT_ID="<application-client-id>"
MICROSOFT_GRAPH_TENANT_ID="<directory-tenant-id>"
MICROSOFT_CALENDAR_EMAIL="calendar-account@your-school.edu"
MICROSOFT_CALENDAR_TIME_ZONE="America/New_York"
MICROSOFT_CALENDAR_SYNC_CRON="*/30 * * * *"
MICROSOFT_CALENDAR_SYNC_LOOKBACK_DAYS=1
MICROSOFT_CALENDAR_SYNC_LOOKAHEAD_DAYS=7
MICROSOFT_TOKEN_CACHE_PATH=".data/msal-token-cache.json"
```

Defaults used by the app if optional values are omitted:

- Sync every 30 minutes.
- Sync window from now minus 1 day through now plus 7 days.
- Event notifications show in the Teacher Dashboard and expire 48 hours after the event start.

## 6. Sign in locally

Run this on the machine hosting the server:

```bash
cd server
npm run calendar:login
```

Expected behavior:

1. Terminal prints a Microsoft device-login URL and code.
2. Open the URL and enter the code.
3. Sign in directly with Microsoft using the calendar account.
4. The command verifies `/me` and `/me/calendar`.
5. Token cache is saved to `.data/msal-token-cache.json` or the configured `MICROSOFT_TOKEN_CACHE_PATH`.

## 7. Test one sync run

```bash
cd server
npm run calendar:sync:once
```

Expected output shape:

```text
Microsoft calendar sync started.
Window: <now - 1 day> to <now + 7 days>.
Fetched N events.
Upserted X notifications.
Archived Y cancelled/deleted notifications.
Microsoft calendar sync completed.
```

Running the command twice should update the same notification rows, not create duplicates.

## 8. Start automatic sync

```bash
cd server
npm run dev
```

If configured, startup logs:

```text
[microsoft-calendar] sync scheduled (*/30 * * * *)
```

If configuration is missing, startup logs an actionable disabled message and the rest of the server still runs.

## Troubleshooting

- `MICROSOFT_GRAPH_CLIENT_ID is required` / `TENANT_ID is required`: add the Entra app registration IDs to `server/.env`.
- `No Microsoft account is stored...`: run `npm run calendar:login` on the server machine.
- Admin consent required: ask the Microsoft 365 admin to approve `User.Read`, `Calendars.Read`, and `offline_access` for the app registration.
- Shared mailbox/calendar returns access denied: grant the signed-in account access to that calendar or sign in with the mailbox/service account that owns the default calendar.
- Duplicate notifications: the sync dedupes by Microsoft Graph event ID plus calendar email. If the calendar email changes, old rows can be archived manually or left to expire.
