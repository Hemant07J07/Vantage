import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-3xl text-accent">404</p>
        <h1 className="mt-3 text-lg font-semibold text-hi">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          That page doesn&apos;t exist, or the record was removed.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link href="/dashboard">
            <Button variant="primary">Go to dashboard</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
