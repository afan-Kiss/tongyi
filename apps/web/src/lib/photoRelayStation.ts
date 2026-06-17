const STATION_KEY = 'jade-photo-relay-station-v1'

export function loadPhotoRelayStationId(): string | null {
  try {
    const id = localStorage.getItem(STATION_KEY)?.trim()
    return id || null
  } catch {
    return null
  }
}

export function savePhotoRelayStationId(sessionId: string) {
  try {
    localStorage.setItem(STATION_KEY, sessionId)
  } catch {
    /* ignore */
  }
}

export function clearPhotoRelayStationId() {
  try {
    localStorage.removeItem(STATION_KEY)
  } catch {
    /* ignore */
  }
}
