const COOKIE_NAME = 'ptti_room'
const COOKIE_DAYS = 365

export function getRoomCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setRoomCookie(roomName: string): void {
  const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString()
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(roomName)}; expires=${expires}; path=/; SameSite=Lax`
}
