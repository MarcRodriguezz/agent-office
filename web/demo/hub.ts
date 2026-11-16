export interface Sock {
  deliver: (msg: any) => void;
}

const socks = new Set<Sock>();
const post = (sock: Sock, data: string) => queueMicrotask(() => socks.has(sock) && sock.deliver(JSON.parse(data)));

export const hub = {
  add(sock: Sock) {
    socks.add(sock);
  },
  remove(sock: Sock) {
    socks.delete(sock);
  },
  send(sock: Sock, msg: unknown) {
    post(sock, JSON.stringify(msg));
  },
  broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const sock of socks) post(sock, data);
  },
};
