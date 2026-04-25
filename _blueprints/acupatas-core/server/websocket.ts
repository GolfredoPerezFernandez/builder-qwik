import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { getSessionByToken } from '../lib/auth';

interface WSClient {
    ws: WebSocket;
    userId: string;
    isAlive: boolean;
}

// Global registry of connected clients bound to globalThis for Vite SSR bridging
const globalWs = globalThis as any;
if (!globalWs.__wsClients) {
    globalWs.__wsClients = new Set<WSClient>();
}
const clients = globalWs.__wsClients as Set<WSClient>;

let wss: WebSocketServer | null = globalWs.__wss || null;

const getCookieValue = (cookieHeader: string | undefined, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';');
    for (const cookieEntry of cookies) {
        const [rawName, ...rest] = cookieEntry.trim().split('=');
        if (rawName === name) {
            return decodeURIComponent(rest.join('='));
        }
    }
    return null;
};

export const initWebSocketServer = (server: any) => {
    if (wss) return;

    wss = new WebSocketServer({ noServer: true });
    globalWs.__wss = wss;

    server.on('upgrade', async (request: IncomingMessage, socket: any, head: any) => {
        try {
            const url = new URL(request.url || '', `http://${request.headers.host}`);
            if (url.pathname === '/ws') {
                const sessionToken = getCookieValue(request.headers.cookie, 'acupatas_session');
                const session = await getSessionByToken(sessionToken);
                if (!session?.userId) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
                (request as IncomingMessage & { wsUserId?: string }).wsUserId = session.userId;
                wss!.handleUpgrade(request, socket, head, (ws) => {
                    wss!.emit('connection', ws, request);
                });
            }
            // If it's not '/ws', we do nothing and let other listeners (like Vite HMR) handle it.
        } catch {
            // Ignore malformed URLs
        }
    });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const effectiveUserId = (req as IncomingMessage & { wsUserId?: string }).wsUserId;
        if (!effectiveUserId) {
            ws.close();
            return;
        }

        const client: WSClient = { ws, userId: effectiveUserId, isAlive: true };
        clients.add(client);

        ws.on('pong', () => {
            client.isAlive = true;
        });

        ws.on('close', () => {
            clients.delete(client);
        });
    });

    // Heartbeat to clear dead connections
    const interval = setInterval(() => {
        clients.forEach((c) => {
            if (!c.isAlive) {
                c.ws.terminate();
                clients.delete(c);
                return;
            }
            c.isAlive = false;
            c.ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    console.log('WebSocket server initialized on /ws');
};

export function notifyUserWs(userId: string, data: any) {
    if (!wss) {
        return;
    }
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    }
};

export const broadcastWs = (data: any) => {
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    }
};
