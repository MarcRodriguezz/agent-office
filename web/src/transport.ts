export const DEMO = false;

export interface Link {
  send: (msg: unknown) => void;
  close: () => void;
  isOpen: () => boolean;
}

export interface LinkEvents {
  open: () => void;
  message: (msg: any) => void;
  close: () => void;
}

export async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

export function openLink(officeId: string, on: LinkEvents): Link {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/o/${officeId}/ws`);
  ws.onopen = on.open;
  ws.onmessage = (e) => on.message(JSON.parse(e.data));
  ws.onclose = on.close;
  return {
    send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
    isOpen: () => ws.readyState === WebSocket.OPEN,
  };
}
