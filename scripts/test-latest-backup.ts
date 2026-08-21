import "dotenv/config";
import { getBackupHistory, testRestoreBackup, verifyBackup } from "../server/backup";

async function main() {
  const history = await getBackupHistory();
  const latest = history[0];
  if (!latest) throw new Error("No backup versions are available.");

  console.log(`Testing backup ${latest.id} from ${latest.createdAt}`);
  const verification = await verifyBackup(latest.id);
  console.log(`Integrity: OK (${verification.checksumSha256})`);
  const restore = await testRestoreBackup(latest.id);
  console.log(`Restore dry-run: OK — ${restore.rowCount} rows across ${restore.tableCount} tables`);
}

main().catch(error => {
  console.error("Backup restore test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
