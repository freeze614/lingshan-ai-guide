/**
 * WebSocket Service — real-time event broadcasting.
 */
import { WebSocket } from 'ws';

const adminClients = new Set<WebSocket>();
const visitorClients = new Set<WebSocket>();
const registeredClients = new WeakSet<WebSocket>();

export function addClient(ws: WebSocket, role: 'admin' | 'visitor'): void {
  if (role === 'admin') {
    adminClients.add(ws);
    console.log(`[WS] Admin connected (${adminClients.size} total)`);
  } else {
    visitorClients.add(ws);
  }

  // Prevent duplicate listener registration on the same WebSocket
  if (registeredClients.has(ws)) return;
  registeredClients.add(ws);

  ws.on('close', () => {
    adminClients.delete(ws);
    visitorClients.delete(ws);
    registeredClients.delete(ws);
    if (role === 'admin') {
      console.log(`[WS] Admin disconnected (${adminClients.size} remaining)`);
    }
  });

  ws.on('error', () => {
    adminClients.delete(ws);
    visitorClients.delete(ws);
    registeredClients.delete(ws);
  });
}

function broadcastToAdmins(message: object): void {
  const data = JSON.stringify(message);
  for (const ws of adminClients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(data); } catch {}
    }
  }
}

/**
 * Broadcast a new Q&A event to admin dashboard subscribers.
 */
export function broadcastQueryEvent(payload: {
  query_short: string;
  emotion: string;
  response_time_ms: number;
  used_llm: boolean;
}): void {
  broadcastToAdmins({
    type: 'new_query',
    ...payload,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast updated stats snapshot.
 */
export function broadcastStatsUpdate(stats: {
  today_queries: number;
  week_queries: number;
  avg_satisfaction: number;
}): void {
  broadcastToAdmins({
    type: 'stats_update',
    ...stats,
    timestamp: Date.now(),
  });
}

export function getAdminCount(): number {
  return adminClients.size;
}

export function getVisitorCount(): number {
  return visitorClients.size;
}
