import { Button } from "@/components/ui/button";
import { Eye, LogOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface PublicImpersonationSession {
  id: string;
  actorEmail: string | null;
  targetUserId: number;
  targetEmail: string | null;
  readOnly: true;
  expiresAt: number;
}

function hasImpersonationFlag() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some(value => value.trim() === "slugly_impersonation_active=1");
}

function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function ImpersonationBanner() {
  const [session, setSession] = useState<PublicImpersonationSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [exiting, setExiting] = useState(false);

  const exit = useCallback(async (automatic = false) => {
    if (exiting) return;
    setExiting(true);
    try {
      await fetch("/api/impersonation/exit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: automatic ? "session-expired" : "manual-exit" }),
      });
    } finally {
      window.location.href = "/admin";
    }
  }, [exiting]);

  useEffect(() => {
    if (!hasImpersonationFlag()) return;
    let cancelled = false;
    fetch("/api/impersonation/status", { credentials: "include" })
      .then(async response => response.ok ? response.json() : { active: false })
      .then(data => {
        if (cancelled) return;
        if (data?.active && data.session) setSession(data.session);
        else setSession(null);
      })
      .catch(() => setSession(null));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) return;
    document.body.dataset.sluglyImpersonating = "true";
    document.body.style.paddingTop = "48px";
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      delete document.body.dataset.sluglyImpersonating;
      document.body.style.paddingTop = "";
    };
  }, [session]);

  const remaining = useMemo(() => session ? session.expiresAt - now : 0, [session, now]);

  useEffect(() => {
    if (session && remaining <= 0) void exit(true);
  }, [session, remaining, exit]);

  if (!session) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[2147483647] flex h-12 items-center justify-center border-b border-amber-400 bg-amber-100 px-3 text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex w-full max-w-6xl items-center gap-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <strong className="shrink-0">Read-only support view</strong>
        <span className="min-w-0 truncate">
          Viewing as {session.targetEmail || `user #${session.targetUserId}`}
        </span>
        <span className="ml-auto shrink-0 font-mono font-semibold tabular-nums">{formatRemaining(remaining)}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 border-amber-600 bg-transparent hover:bg-amber-200 dark:hover:bg-amber-900"
          disabled={exiting}
          onClick={() => void exit(false)}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Exit
        </Button>
      </div>
    </div>
  );
}
