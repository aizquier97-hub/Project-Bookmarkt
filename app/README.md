# Bookmarkt App

The native Bookmarkt client: an [Expo](https://expo.dev) (SDK 54) React
Native app backed by Supabase (auth, Postgres with RLS, storage, Edge
Functions). Product context, roadmap, and decisions live in the repository
root [README](../README.md) and [docs/](../docs/).

## Development

```bash
npm install
npx expo start
```

The app talks to the live Supabase project configured in `src/lib/supabase.ts`
via `app.config.ts` extra fields.

## Quality checks

Run before every ship (all must pass clean):

```bash
npx tsc --noEmit
npx eslint src --max-warnings 0
npx jest --silent
```

## Shipping

- **JS-only changes** ship over-the-air to the Android preview build:
  `npx eas-cli update --channel preview --message "..."`.
- **Native module or config changes** need a fresh EAS build:
  `npx eas-cli build --profile preview --platform android`.

## Structure

- `src/app/` - expo-router routes: `(auth)` sign-in/up, `(app)` shelf,
  book screen (entries, characters, progress), companion chat, settings.
- `src/domains/` - feature logic and Supabase access (library, entries,
  characters, companion, reporting, voice), unit-tested under `__tests__/`.
- `src/components/` - shared UI (states, toast, RecapCard).
- `src/lib/` - theme tokens, query keys, Supabase client.

The AI companion is server-gated: every AI request goes through the
`companion` Edge Function (`../supabase/functions/companion/`), which checks
auth, entitlement, and daily quotas before any provider call. The client
never makes entitlement decisions.