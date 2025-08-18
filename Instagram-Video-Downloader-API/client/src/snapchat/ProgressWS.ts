export function createProgressSocket(
  username: string,
  mediaType: 'stories' | 'highlights' | 'spotlights' = 'stories'
): WebSocket {
  const apiBase = (import.meta as any).env?.VITE_SNAPCHAT_API_BASE || '/snapchat-api';
  const wsBase: string | undefined = (import.meta as any).env?.VITE_SNAPCHAT_WS_BASE;

  let url: string;
  if (wsBase) {
    const base = wsBase.replace(/\/$/, '');
    url = `${base}/ws/progress/${encodeURIComponent(username)}/${mediaType}`;
  } else {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = (apiBase as string).replace(/\/$/, '');
    url = `${protocol}//${location.host}${basePath}/ws/progress/${encodeURIComponent(username)}/${mediaType}`;
  }

  return new WebSocket(url);
}

