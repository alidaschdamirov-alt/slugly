import { runScheduledBackupIfDue } from "./backup";

let started = false;

export function startBackupSchedulerWithTelemetry() {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;

  const tick = async () => {
    const startedAt = Date.now();
    try {
      const result = await runScheduledBackupIfDue();
      if (!result.ran) return;
      const { recordBackgroundJobResult } = await import("./systemHealth");
      await recordBackgroundJobResult("backup", {
        success: true,
        durationMs: Date.now() - startedAt,
        processed: 1,
        detail: `Encrypted backup ${result.manifest.id} created and retained as ${result.manifest.key}`,
      });
    } catch (error: any) {
      console.error("[BackupScheduler]", error);
      const { recordBackgroundJobResult } = await import("./systemHealth");
      await recordBackgroundJobResult("backup", {
        success: false,
        durationMs: Date.now() - startedAt,
        processed: 0,
        detail: error?.message || "Encrypted backup failed",
      }).catch(() => undefined);
    }
  };

  const initial = setTimeout(() => void tick(), 15_000);
  initial.unref?.();
  const interval = setInterval(() => void tick(), 60_000);
  interval.unref?.();
}
