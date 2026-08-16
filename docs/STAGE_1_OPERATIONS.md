# Stage 1 Operations

## AI safeguards

The production `ai-bookmate` Edge Function requires an authenticated Supabase user before it can call Gemini.

Daily limits reset at 00:00 UTC:

- Per user: 30 AI generations (`AI_DAILY_USER_LIMIT`)
- Entire project: 500 AI generations (`AI_DAILY_PROJECT_LIMIT`)

Quota consumption is atomic in `consume_ai_daily_quota`, so concurrent requests cannot bypass either limit. All attempts are recorded in `ai_usage_events` with mode, outcome, duration, HTTP status, provider status, and a bounded error message. This table and its RPC are service-role-only.

### Monitoring queries

Run these in the Supabase SQL Editor.

Daily volume, reliability, and latency:

```sql
select *
from public.ai_usage_daily_summary
where usage_date >= current_date - 7
order by usage_date desc, mode;
```

Highest-usage users:

```sql
select *
from public.ai_usage_user_daily_summary
where usage_date >= current_date - 7
order by usage_date desc, generations desc;
```

Recent failures:

```sql
select started_at, user_id, mode, duration_ms, http_status,
       upstream_status, error_code, error_message
from public.ai_usage_events
where status = 'failed'
order by started_at desc
limit 100;
```

Change either limit without redeploying:

```powershell
npx supabase secrets set AI_DAILY_USER_LIMIT=30 AI_DAILY_PROJECT_LIMIT=500 --project-ref bfallxtcxxyykcnkedom
```

## Storage and account security

The `book-images` bucket is private. Object policies only allow an authenticated user to select, upload, update, or delete files whose first folder segment matches that user's id. The app stores stable object paths and creates one-hour signed display URLs after authentication. Anonymous bucket listing and public object URLs must remain blocked.

New accounts require at least 12 characters containing uppercase, lowercase, a number, and a symbol. The requirement is enforced by both the hosted Auth service and the signup UI.

Leaked-password protection is valid and recommended, but Supabase exposes it only on Pro and above. After upgrading for production backups, enable **Authentication > Password strength > Prevent use of leaked passwords**. Existing password hashes cannot be checked retrospectively; the control applies when users sign up or change passwords.

## Database backups

Audit result on 2026-08-16:

- Database status: active and healthy
- WAL-G: enabled
- Available physical backups: none
- Point-in-Time Recovery (PITR): disabled

For Stage 1, use the Supabase Pro daily backups with seven-day retention. PITR is not required for the MVP because it is a separate, substantially more expensive add-on; reconsider it when paid usage and recovery requirements justify it.

Owner action:

1. In Supabase, open **Organization billing** and move the project to Pro if it is still on Free.
2. Open **Database > Backups > Scheduled backups**.
3. Confirm a daily backup is listed. A newly upgraded project may need up to 24 hours to create its first backup.
4. Do not run an actual production restore merely as a test; confirm availability and use the procedure below during an incident or against a cloned project.

### Restore procedure

1. Confirm the incident and choose the latest recovery point before the unwanted change.
2. Announce maintenance and stop application writes before restoring.
3. In **Database > Backups**, select the chosen daily backup and start the restore.
4. Expect the project to be unavailable during restoration.
5. After completion, verify authentication, migrations, RLS, books, entries, characters, image metadata, AI audit tables, and quota tables.
6. Run one controlled add/edit/delete workflow and one AI generation before reopening writes.
7. Record the incident time, recovery point, estimated lost-data window, and validation results.

Supabase database backups contain Storage metadata but not the image objects themselves. Off-site replication of the `book-images` bucket remains a Stage 2 production-architecture item. Until then, treat user-uploaded images as non-recoverable if the underlying Storage object is deleted.
