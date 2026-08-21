# Stage 2 Acceptance Baseline

This document captures the current production PWA behavior for the retained
scope as acceptance criteria. It satisfies the Stage 2 entry-gate requirement
and is the parity checklist for the native rebuild: the native application must
reproduce every criterion below unless a recorded decision changes it. Captured
against production commit `d108db1` (deployed 2026-08-17, validated through the
Stage 1 observation window).

Retained scope per D-012: authentication, library and metadata, reading
progress and manual entries, character maps, private images, analytics, and
backend cost controls. AI-generation flows are retired and are not part of this
baseline.

## 1. Authentication and session

- [ ] Signup requires email and a password of at least 12 characters with
      uppercase, lowercase, number, and symbol; weak passwords are rejected
      with a clear message.
- [ ] Login with valid credentials lands the user in their library; invalid
      credentials produce a readable error, not a hang.
- [ ] Session restores automatically on revisit without re-entering
      credentials until the session expires.
- [ ] Logout returns to the login screen and clears access to user data.
- [ ] After logout/login, all previously saved books, entries, characters, and
      images are present (verified Stage 1).
- [ ] Auth state changes never run database work inside the Auth callback;
      data loading is deferred until after the callback completes.

## 2. Library and book metadata

- [ ] A user can add a book by title; the add completes without timeout.
- [ ] Open Library lookup can populate author and cover metadata; lookup
      failure never blocks manual entry of metadata.
- [ ] Book details (title, author) can be edited and saved, and persist across
      sessions.
- [ ] Books list shows only the signed-in user's books (RLS-enforced).
- [ ] Deleting a book removes it from the library view.

## 3. Book selection and scoping

- [ ] All capture surfaces (progress entries, characters, images) are scoped
      to the currently selected book.
- [ ] Rapid switching between books never shows another book's entries,
      characters, or images (stale responses cannot cross book boundaries).
- [ ] With no book selected, capture controls are disabled with an explanatory
      hint rather than failing silently.

## 4. Reading progress and manual entries

- [ ] The entry form captures progress type (page or chapter), progress value,
      and free-text reading entry.
- [ ] Saved entries are prefixed `[Manual Entry - <range>]` with the progress
      range recorded.
- [ ] The latest entry defines the reading boundary; the boundary label
      updates live as the form changes and displays the current boundary for
      the selected book.
- [ ] Entries render newest-first with their recorded progress range.
- [ ] Legacy `[AI Summary - ...]` entries from the prototype era still display
      as plain text and their progress boundaries still parse.
- [ ] Draft form values persist per book across reloads until saved
      (localStorage draft behavior).
- [ ] Entries are isolated per account (RLS-enforced).

## 5. Character maps

- [ ] A user can add a character with a name and description for the selected
      book.
- [ ] Characters can be edited and deleted, and persist across sessions.
- [ ] Character lists are book-scoped and account-isolated.

## 6. Book images

- [ ] A user can upload an image for the selected book from a file or from the
      device camera.
- [ ] Images are stored in a private bucket and displayed via signed URLs;
      anonymous access to list, read, or upload is denied.
- [ ] Images can be replaced and deleted.
- [ ] Legacy image paths from earlier schema versions still resolve until
      migrated.

## 7. Analytics and reporting

- [ ] Key events are recorded: user sign-in, book added, manual entry added
      (with progress type).
- [ ] Analytics failures are silent to the user and never block a save.
- [ ] Missing-analytics-table errors are classified and tolerated.

## 8. Backend cost and safety controls

- [ ] The `ai-bookmate` edge function refuses all generation requests with
      HTTP 410 `AI_GENERATION_DISABLED` while `AI_GENERATION_ENABLED` is
      unset/false (verified live 2026-08-17).
- [ ] If the flag were enabled, the function still requires an authenticated
      JWT and enforces 30 generations/user/day and 500/project/day.
- [ ] No client surface calls the generation endpoint.

## 9. Offline and update behavior

- [ ] The PWA shell is cached by the service worker (`bookmarkt-v3`); a cache
      version bump propagates the new shell to installed clients on next
      visit.
- [ ] The app loads over HTTPS from the Netlify production site and is
      installable as a PWA.

## Usage

- Stage 2 cutover runs the old PWA and the native app against this checklist;
  every unchecked criterion is a parity gap to resolve or a recorded decision
  to change behavior.
- Checkboxes remain unchecked in this document; each cutover run records its
  results in the Stage 2 exit review evidence, not here.
