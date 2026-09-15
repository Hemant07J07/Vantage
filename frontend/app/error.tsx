"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Root error boundary. Before this existed, a single failed fetch rendered
 * Next's unstyled default error page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // BackendError stringifies its status into the message, so a session that
  // expired can be told apart from a service that's actually broken.
  const isAuth = /\b(401|403)\b/.test(error.message);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-5 h-5 text-danger" />
        </div>
        <h1 className="text-lg font-semibold text-hi">
          {isAuth ? "Your session expired" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isAuth
            ? "Sign in again to pick up where you left off."
            : "That page couldn't load. The backend may be starting up or unreachable."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {isAuth ? (
            <Link href="/login">
              <Button variant="primary">Sign in</Button>
            </Link>
          ) : (
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          )}
          <Link href="/">
            <Button variant="secondary">Go home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
