"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only same-origin dashboard paths are honoured, so a crafted ?next= can't
  // turn the login form into an open redirect.
  const raw = searchParams.get("next") || "/dashboard";
  const next = raw.startsWith("/dashboard") ? raw : "/dashboard";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Invalid credentials.");
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the backend running?");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* The card is opaque on purpose: the field animates behind it, and the
          form has to stay readable over whatever frame it happens to be on. */}
      <div className="bg-surface border border-line rounded-card shadow-card p-6">
          <h1 className="text-lg font-semibold text-hi">Sign in</h1>
          <p className="mt-1 text-sm text-muted">
            Access your lead intelligence dashboard.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 px-3 py-2 rounded-lg bg-danger-soft text-danger text-sm"
            >
              {error}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs text-muted mb-1.5">
                Username
              </label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg bg-sunken border border-line text-sm text-hi outline-none focus:border-accent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs text-muted mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg bg-sunken border border-line text-sm text-hi outline-none focus:border-accent"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-faint">
            No account yet?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary during prerender. The fallback is
  // transparent so the layout's animated field isn't briefly painted over.
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <LoginForm />
    </Suspense>
  );
}
