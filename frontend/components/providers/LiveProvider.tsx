"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { LeadListItem, LeadStatus } from "@/lib/types";

/**
 * One WebSocket for the whole dashboard.
 *
 * The old `useLeadsSocket` hook opened a connection per caller, and two
 * components used it — so every dashboard page held two sockets to the same
 * endpoint, receiving every message twice. This owns a single connection and
 * fans events out to subscribers.
 *
 * Mounted only in the dashboard layout: the public landing page must not open
 * a socket for an anonymous visitor who has nothing to subscribe to.
 */

type DashboardEvent =
  | { event: "connected" }
  | { event: "lead.status"; payload: { lead_id: number; status: LeadStatus } }
  | { event: "lead.qualified"; payload: LeadListItem };

type Handler = (payload: unknown) => void;

interface LiveContextValue {
  connected: boolean;
  subscribe: (event: string, handler: Handler) => () => void;
}

const LiveContext = createContext<LiveContextValue>({
  connected: false,
  subscribe: () => () => {},
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);

  const subscribe = useCallback((event: string, handler: Handler) => {
    const map = handlersRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event)!.add(handler);
    return () => {
      map.get(event)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/dashboard/";
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (raw) => {
        let data: DashboardEvent;
        try {
          data = JSON.parse(raw.data);
        } catch {
          return; // a frame we can't parse isn't worth crashing the page over
        }
        const handlers = handlersRef.current.get(data.event);
        if (!handlers) return;
        const payload = "payload" in data ? data.payload : undefined;
        handlers.forEach((handler) => handler(payload));
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        // Exponential backoff, capped — a backend restart shouldn't turn into
        // a reconnect storm from every open tab.
        const delay = Math.min(1000 * 2 ** attemptRef.current, 15000);
        attemptRef.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return (
    <LiveContext.Provider value={{ connected, subscribe }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  return useContext(LiveContext);
}

/** Convenience wrapper for the two events the dashboard actually reacts to. */
export function useLeadEvents({
  onQualified,
  onStatus,
}: {
  onQualified?: (lead: LeadListItem) => void;
  onStatus?: (leadId: number, status: LeadStatus) => void;
}) {
  const { subscribe, connected } = useLive();

  // Held in a ref so subscriptions don't churn on every parent render.
  const handlersRef = useRef({ onQualified, onStatus });
  handlersRef.current = { onQualified, onStatus };

  useEffect(() => {
    const offQualified = subscribe("lead.qualified", (payload) => {
      handlersRef.current.onQualified?.(payload as LeadListItem);
    });
    const offStatus = subscribe("lead.status", (payload) => {
      const { lead_id, status } = payload as { lead_id: number; status: LeadStatus };
      handlersRef.current.onStatus?.(lead_id, status);
    });
    return () => {
      offQualified();
      offStatus();
    };
  }, [subscribe]);

  return { connected };
}
