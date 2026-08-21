# Slugly Backup & Restore Runbook

This runbook is the operational procedure for restoring Slugly from an encrypted backup produced by backup format v2.

## What the backup contains

A v2 backup is an AES-256-GCM encrypted snapshot containing the current Slugly database tables, including users, workspaces, memberships, projects, links, clicks, domains, redirect rules, UTM templates, pixels, abuse data, settings, audit logs, rate limits and notifications.

Every version has:

- a version manifest;
- SHA-256 checksum of the plaintext payload;
- AES-256-GCM authentication tag;
- row counts per table;
- integrity verification status;
- dry-run restore-test status.

The encryption key is never stored inside the backup. Keep `BACKUP_ENCRYPTION_KEY` stable while any retained backup may need to be restored.

## Recovery policy

1. Never restore an unverified backup directly into production.
2. Run **Verify** in Admin → Backups first.
3. Run **Test restore** and require a passing result.
4. Restore to a fresh staging database before production whenever time permits.
5. Take a new encrypted backup of the current production state immediately before a production restore.
6. Put Slugly into a maintenance window before changing production data.
7. Preserve the current encryption key and database credentials until recovery is fully validated.

## Step 1 — Select a backup

In Admin → Backups & Recovery:

1. Choose the desired version by creation time and source.
2. Confirm `integrityStatus = verified`.
3. Confirm the SHA-256 checksum is present.
4. Prefer a version that has `restoreTestStatus = passed`.
5. Click **Verify** again immediately before recovery.
6. Click **Test restore**. This decrypts the snapshot, verifies its checksum and validates table/reference consistency without writing anything to production.

If either operation fails, stop and choose another backup.

## Step 2 — Download the encrypted archive

Use **Download encrypted** in Admin → Backups. Slugly issues a private signed URL that expires after 15 minutes and records the download in the audit log.

The file is intentionally encrypted. Do not convert it to plaintext in a browser, ticket, chat, shared drive or email.

## Step 3 — Stage the recovery

Create a fresh MySQL database with the same schema version as the running Slugly release. Do not overwrite production for the first restore attempt.

Recommended sequence:

1. Deploy the same Slugly commit/version to a staging environment.
2. Use the same `BACKUP_ENCRYPTION_KEY` that was active when the backup was created.
3. Apply all schema migrations required by that Slugly version.
4. Decrypt the backup only inside a trusted backend/admin recovery environment.
5. Load records in dependency-aware order:
   - users;
   - workspaces;
   - workspace members and invitations;
   - projects;
   - domains;
   - links;
   - link rules, UTM templates and retargeting pixels;
   - clicks;
   - retired codes;
   - abuse reports and blocked domains;
   - notifications and notification recipients;
   - rate limits;
   - site settings;
   - audit log.
6. Preserve original primary keys so link/project/click references remain valid.
7. Do not send transactional emails or scheduled jobs while staging restore validation is running.

## Step 4 — Validate the staged restore

Before production recovery, confirm all of the following:

- row counts match the backup manifest;
- users can be resolved to their workspaces;
- project → user/workspace references are valid;
- link → user/project references are valid;
- click → link references are valid;
- short codes resolve to the expected destination URLs;
- paused/quarantined/deleted states still block redirects correctly;
- custom domains still point to the intended links;
- admin access, MFA and privileged-IP controls still work;
- audit logs can be queried;
- `/healthz` is healthy;
- representative dashboard and analytics queries load without 5xx errors.

Use a small representative set of links and users for functional checks. Do not send real notifications or emails from staging.

## Step 5 — Production restore

Only after staged validation passes:

1. Announce/start the maintenance window.
2. Stop or disable traffic that writes data where operationally possible.
3. Pause background/scheduled jobs.
4. Create one final encrypted backup of the current production database.
5. Record the chosen restore backup ID and its SHA-256 checksum in the incident/change record.
6. Restore into production using the same dependency-aware order as staging.
7. Validate manifest row counts and foreign/reference relationships.
8. Restart the application and background jobs.
9. Run the post-restore checks below.
10. End the maintenance window only after validation succeeds.

## Step 6 — Post-restore checks

Immediately after production recovery:

- verify `/healthz`;
- sign in with a controlled admin account;
- open Dashboard, Projects, Links and Admin pages;
- test one known short-link redirect without editing data;
- verify a paused/quarantined link remains blocked;
- confirm custom-domain status;
- check recent analytics for representative links;
- check System Health for API/redirect errors;
- verify email sending remains deliberately enabled/disabled as expected;
- run **Verify** on a newly created post-restore backup.

Monitor error rate and redirects closely after the maintenance window.

## Rollback

If production validation fails:

1. Return the service to maintenance mode.
2. Restore the encrypted pre-restore snapshot created immediately before the recovery attempt.
3. Validate row counts and critical link redirects again.
4. Do not delete the failed recovery backup or logs; retain them for incident analysis.
5. Record the rollback in the operational/audit record.

## Key-loss warning

If `BACKUP_ENCRYPTION_KEY` is lost or changed without retaining the previous value, backups encrypted with the old key cannot be decrypted. Key rotation therefore requires keeping the prior key for at least the configured backup-retention window, or re-encrypting retained archives under the new key.

## Regular recovery test

At least monthly, select a recent backup and:

1. run Admin **Verify**;
2. run Admin **Test restore**;
3. perform a real restore into an isolated staging database;
4. validate representative redirects, ownership and analytics;
5. record the result and remediation for any failure.

The in-product **Test restore** is deliberately non-destructive: it proves decryption, integrity and structural/reference consistency. It does not replace periodic staging restores.
