# bookmarkt.io

The official Bookmarkt site: a static landing page plus a waitlist form. No
build step, no framework, no third-party fonts or scripts.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Landing page (hero, three pillars, promises, waitlist call to action). |
| `waitlist.html` + `waitlist.js` | `/waitlist` signup form; posts to Supabase. |
| `style.css` | Tokens mirror `app/src/lib/theme.ts` (walnut, paper, ink, gold; serif). |
| `_headers` | Security headers for Cloudflare Pages, including the CSP. |
| `favicon.png` | Copy of `icons/icon-192.png`. |

## Hosting

Cloudflare Pages project `project-bookmarkt`, connected to this repository.

- Production branch `main`, root directory empty, build command empty,
  output directory `website`.
- Every push to `main` deploys automatically; pull requests get a preview URL.
- `bookmarkt.io` and `www.bookmarkt.io` are proxied CNAMEs to
  `project-bookmarkt.pages.dev`.
- Clean URLs are on by default, so `waitlist.html` is served at `/waitlist`.

To change the site: edit files here, open a pull request, merge. Nothing to
deploy by hand.

## Waitlist data

`waitlist.js` sends one `POST` to
`https://bfallxtcxxyykcnkedom.supabase.co/rest/v1/waitlist_signups` with the
publishable key (the same key the app ships with). The table is defined in
`supabase/migrations/20261005120000_add_waitlist_signups.sql`:

- `anon` may insert `email`, `name`, `platform`, `currently_reading` and
  nothing else; no public select, update, or delete.
- Emails are lower-cased and unique; a repeat signup returns 409 and the page
  says "already on the list".
- A trigger refuses more than 300 signups an hour (`hint:
  waitlist_rate_limited`); the page asks the reader to try later.
- The CSP in `_headers` only allows `connect-src` to that Supabase host.

Read the signups in the Supabase dashboard: Table Editor -> `waitlist_signups`.

Follow-ups if abuse ever shows up: Cloudflare Turnstile on the form, or move
the insert behind a Pages Function so the key leaves the page.

## Local preview

```powershell
npx serve website -l 8787
npx html-validate website/*.html
```
