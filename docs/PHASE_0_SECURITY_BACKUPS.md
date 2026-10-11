# Phase 0: Security, encrypted export, staging-only restore

Status: **DRAFT / NOT PRODUCTION APPROVED**

## Current deliverables
- Administrator-only encrypted backup export, including selected MongoDB collections and invoice object-store attachments.
- Administrator password reconfirmation before backup.
- AES-256-GCM encryption; scrypt password derivation; random salt and nonce.
- Archive manifest with SHA-256 integrity checks.
- Isolated restore endpoint disabled unless BACKUP_RESTORE_ENABLED=true; requires a new database name of form finanspulse_restore_xxxx and literal RESTORE confirmation.
- Backup controls on administrator Users page.
- Prevent administrator password being silently overwritten on backend startup.
- Disable demonstration-account provisioning by default (SEED_DEMO_USERS=true to opt in).

## Limitations and prerequisites
- **Not a consistent point-in-time disaster recovery snapshot:** export reads MongoDB collections sequentially. Writes during export can yield cross-collection inconsistencies.
- Browser download is capped at 100 MB compressed. Larger databases require managed backups or streamed export.
- Existing invoices are stored in an Emergent object-store API and must be fetched; storage availability and credentials are required.
- Only selected core collections are exported. Add newly introduced business collections explicitly before enabling other phases.
- Restore reimports database records into a separate *new* database and restores invoice objects into a separate namespace. The live database cannot be selected. This endpoint remains disabled by default.
- Restored file objects can remain after a failed import and require operator cleanup; this must be tested in staging.
- No recurring job, off-site backup, production MongoDB snapshot, or automated restore testing is included yet.
- Restored user accounts may have working password hashes. Never expose staging to public traffic; rotate secrets and use separate credentials.
- This feature is **not a substitute** for managed MongoDB snapshots and independent encrypted off-site backups.

## Deployment sequence
1. Determine production DB hosting, object store availability, staging domain, cookie origins, and reverse-proxy restrictions.
2. Create a verified database plus object-store snapshot outside this application. Test a restore to a non-production environment.
3. Install dependencies; run tests. Verify production CORS_ORIGINS is explicit and contains the real deployed frontend origin.
4. Deploy this branch in an isolated test environment. Keep BACKUP_RESTORE_ENABLED unset or false.
5. Use a test administrator to export; validate decryption and test-only restoration; verify invoices and counts.
6. Inspect the diff for secrets; run automated dependency scanning and verify no existing functionality regressed.
7. Only merge after signoff, tested rollback, and managed backups are operational.

## Security tasks still open
- Eliminate browser localStorage JWT and token in login response only **after** validating cookie behavior across Emergent frontend/backend origins.
- Deploy cross-site CSRF protection, origin validation, and strict CORS without breaking login.
- Remove or reset previously provisioned demo accounts after checking legitimate users.
- Introduce audit events and session revocation; expand admin password policy.
- Add hourly/incremental protection and independent automated backups with retention and alerts.
- Add resource streaming, database snapshot consistency, restore-side isolation and stronger archive validation.
- Implement a staging-only restore UI once tested.

## Rollback
Revert the application deployment to the previous commit while preserving the database. New endpoints are additive. Never restore an older database over an active production database without accounting for intervening transactions. 
