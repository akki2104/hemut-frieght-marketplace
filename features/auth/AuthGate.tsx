"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui";
import { getToken, onAuthChange } from "@/lib/auth";

/**
 * Redirects to /login when there's no token — including when the API client
 * clears it after a 401 (e.g. expired token mid-session).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function check() {
      if (getToken()) setReady(true);
      else router.replace("/login");
    }
    check();
    return onAuthChange(check);
  }, [router]);

  if (!ready) return <Spinner label="Checking session…" />;
  return <>{children}</>;
}
