"use client";

import { useEffect } from "react";

// Comfortably inside the 8-hour access-token lifetime, so a tab left open
// overnight keeps a valid token instead of dying at the 8-hour mark.
const RENEW_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Keeps the access cookie fresh for as long as the 7-day refresh token lasts.
 *
 * Renewal can't happen where the expiry is actually noticed — Server
 * Components read cookies but can't write them — so it runs here on a timer
 * against /api/refresh instead. A failed renewal is deliberately silent: the
 * existing auth error boundary already handles a dead session, and a toast
 * about background token renewal would mean nothing to the person reading it.
 */
export function SessionKeepalive() {
  useEffect(() => {
    const renew = () => {
      void fetch("/api/refresh", { method: "POST" }).catch(() => {});
    };

    renew();
    const id = setInterval(renew, RENEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
