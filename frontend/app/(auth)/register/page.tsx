"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Same open-redirect guard as the sign-in form.
  const raw = searchParams.get("next") || "/dashboard";
  const next = raw.startsWith("/dashboard") ? raw : "/dashboard";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Could not create the account.");
        setLoading(false);
        return;
      }

      // Registration signs you in, so go straight to the dashboard.
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the backend running?");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Opaque card: the field animates behind it and the form has to stay
          readable over whatever frame it lands on. */}
      <div className="bg-surface border border-line rounded-card shadow-card p-6">
          <h1 className="text-lg font-semibold text-hi">Create an account</h1>
          <p className="mt-1 text-sm text-muted">
            Research accounts and keep your own dashboard.
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
              <label htmlFor="email" className="block text-xs text-muted mb-1.5">
                Email <span className="text-faint">(optional)</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg bg-sunken border border-line text-sm text-hi outline-none focus:border-accent"
              />
              {/* States the rules the backend actually enforces, so the first
                  attempt isn't a guess that comes back rejected. */}
              <p className="mt-1.5 text-xs text-faint leading-relaxed">
                At least 8 characters. Can&apos;t be entirely numeric, a common
                password, or too close to your username.
              </p>
            </div>

            <Button type="submit" variant="primary" loading={loading} className="w-full">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-faint">
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
  );
}

export default function RegisterPage() {
  // useSearchParams needs a Suspense boundary during prerender. The fallback is
  // transparent so the layout's animated field isn't briefly painted over.
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <RegisterForm />
    </Suspense>
  );
}
