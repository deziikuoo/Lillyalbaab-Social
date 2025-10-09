export function createProgressSocket(username: string, mediaType: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const wsUrl = `${protocol}//${host}/snapchat-api/ws/progress/${encodeURIComponent(username)}/${mediaType}`
  
  return new WebSocket(wsUrl)
}
