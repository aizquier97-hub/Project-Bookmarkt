#!/usr/bin/env node
/**
 * Cross-account isolation check (Stage 3 exit gate, roadmap §11 "test
 * evidence that RLS denies cross-user access").
 *
 * Simulates two authenticated users directly in Postgres via the Supabase
 * Management API query endpoint — the same role + request.jwt.claims switch
 * PostgREST performs — so no real accounts, emails, or client sessions are
 * involved. Seeds a book/entry as user A, probes every cross-user access
 * path as user B, verifies owner access still works, and deletes everything
 * it created. Safe to run against the live project at any time.
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=<sbp_... personal access token>
 *   node scripts/rls-isolation-check.mjs
 *
 * First run: 2026-09-01 — found entries/characters/book_images inserts did
 * not require ownership of the referenced topic; fixed by migration
 * 20260901190000_require_topic_ownership_on_content_writes. All checks pass
 * since.
 */

const PROJECT_REF = 'bfallxtcxxyykcnkedom';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (Supabase personal access token, sbp_...).');
  process.exit(1);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const SQL = `
create temp table _r(ts timestamptz default clock_timestamp(), name text, pass boolean);
grant insert, select on _r to authenticated;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','${A}','authenticated','authenticated','rls-sim-a@internal.check','',now(),now(),now()),
       ('00000000-0000-0000-0000-000000000000','${B}','authenticated','authenticated','rls-sim-b@internal.check','',now(),now(),now());

set role authenticated;
select set_config('request.jwt.claims','{"sub":"${A}","role":"authenticated"}',false);
insert into public.topics (name, user_id) values ('RLS SIM BOOK','${A}');
insert into public.entries (text, topic_id, user_id)
  select 'rls sim entry', id, '${A}' from public.topics where name='RLS SIM BOOK';
insert into _r(name,pass) select 'A sees own book', count(*)=1 from public.topics where name='RLS SIM BOOK';
insert into _r(name,pass) select 'A sees own entry', count(*)=1 from public.entries where text='rls sim entry';
do $$ declare tid bigint; begin
  select id into tid from public.topics where name='RLS SIM BOOK';
  begin
    insert into public.characters (name, description, topic_id, user_id)
      values ('RLS Sim Character','sim',tid,'${A}');
    insert into _r(name,pass) values ('A can write own character', true);
  exception when others then
    insert into _r(name,pass) values ('A can write own character', false);
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"${B}","role":"authenticated"}',false);
insert into _r(name,pass) select 'B cannot read A book', count(*)=0 from public.topics where name='RLS SIM BOOK';
insert into _r(name,pass) select 'B cannot read A entries', count(*)=0 from public.entries where text='rls sim entry';
insert into _r(name,pass) select 'B cannot read A characters', count(*)=0 from public.characters where name='RLS Sim Character';
with u as (update public.topics set name='hijack' where name='RLS SIM BOOK' returning 1)
  insert into _r(name,pass) select 'B update A book affects 0 rows', count(*)=0 from u;
with d as (delete from public.entries where text='rls sim entry' returning 1)
  insert into _r(name,pass) select 'B delete A entry affects 0 rows', count(*)=0 from d;
do $$ begin
  insert into public.topics (name, user_id) values ('spoof','${A}');
  insert into _r(name,pass) values ('B insert spoofing A user_id denied', false);
exception when others then
  insert into _r(name,pass) values ('B insert spoofing A user_id denied', true);
end $$;
do $$ declare tid bigint; begin
  reset role;
  select id into tid from public.topics where name='RLS SIM BOOK';
  set role authenticated;
  begin
    insert into public.entries (text, topic_id, user_id) values ('intruder', tid, '${B}');
    insert into _r(name,pass) values ('B self-owned entry into A topic denied', false);
  exception when others then
    insert into _r(name,pass) values ('B self-owned entry into A topic denied', true);
  end;
  begin
    insert into public.characters (name, description, topic_id, user_id) values ('Intruder','x',tid,'${B}');
    insert into _r(name,pass) values ('B self-owned character into A topic denied', false);
  exception when others then
    insert into _r(name,pass) values ('B self-owned character into A topic denied', true);
  end;
  begin
    insert into public.book_images (topic_id, user_id, image_url) values (tid, '${B}', 'intruder/x.jpg');
    insert into _r(name,pass) values ('B self-owned image into A topic denied', false);
  exception when others then
    insert into _r(name,pass) values ('B self-owned image into A topic denied', true);
  end;
end $$;

reset role;
delete from public.book_images where image_url='intruder/x.jpg';
delete from public.characters where name in ('RLS Sim Character','Intruder');
delete from public.entries where text in ('rls sim entry','intruder');
delete from public.topics where name in ('RLS SIM BOOK','spoof','hijack');
delete from auth.users where id in ('${A}','${B}');
insert into _r(name,pass) select 'cleanup: no sim rows remain',
  (select count(*) from public.topics where name in ('RLS SIM BOOK','spoof','hijack'))=0
  and (select count(*) from auth.users where email like 'rls-sim-%@internal.check')=0;
select name, pass from _r order by ts;
`;

async function main() {
  console.log('RLS cross-account isolation check (simulated users, live project)');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL }),
  });
  if (!res.ok) {
    console.error(`Query failed (${res.status}): ${await res.text()}`);
    process.exitCode = 1;
    return;
  }
  const rows = await res.json();
  let failures = 0;
  for (const row of rows) {
    if (!row.pass) failures += 1;
    console.log(`  ${row.pass ? 'PASS' : 'FAIL'}  ${row.name}`);
  }
  console.log(
    failures === 0
      ? '\nAll isolation checks passed.'
      : `\n${failures} check(s) FAILED — investigate RLS policies immediately.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`ABORTED: ${err.message}`);
  process.exitCode = 1;
});
