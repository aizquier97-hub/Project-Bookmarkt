# Analytics events

First-party product analytics for Bookmarkt. Every event is one row in the
`analytics_events` table (Supabase, RLS: readers insert their own rows; only
the owner's dashboard role reads across users). There is no third-party
analytics SDK (`NSPrivacyTracking: false`, D-085).

**Privacy rule.** Event properties carry statuses, modes, flags and counts
only. Never text a reader typed or dictated, book titles, ISBNs, bookmark
codes, search terms, prices, or store account details. A `topic_id` is a
foreign key to the reader's own book row, so queries can group per book
without the title ever leaving the table it lives in. If a new event needs
something outside this rule, it needs a decision-log row first.

**Columns.** `user_id`, `topic_id` (nullable), `event_name`, `event_properties`
(jsonb), `created_at`. Events are fire-and-forget from the app
(`trackAnalyticsEvent` in `app/src/domains/reporting/analytics.ts`); a failed
insert never blocks or surfaces to the reader.

## Catalogue

Legend for *Since*: the decision that introduced the event. Rows marked
**D-086** are the usage-coverage expansion.

### Sessions and navigation

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `app_opened` | `trigger`: `launch` \| `foreground` | - | D-086 | Once when the signed-in app first becomes active, then once per return from the background at least 30 s after the last `app_opened` (a flick to the notification shade is not a new session). Mounted in the `(app)` layout, so anonymous screens never emit it. |
| `tab_viewed` | `tab`: `index` \| `library` \| `quotes` \| `club` \| `recall` \| `settings` (route names) | - | D-086 | Every time a bottom tab gains focus, including the initial tab. |
| `screen_viewed` | `screen`: stack route name (`book/[id]`, `reading-timer`, `companion`, `add-book`, `subscription`, ...) | - | D-086 | Every time a stack screen gains focus; the `(tabs)` container is excluded because `tab_viewed` covers it. |
| `user_signed_in` | `sourceEvent` (Supabase auth event), `isNewSessionUser` | - | PWA | On a new auth session. |

### Library and add-book funnel

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `book_search_used` | `status`: `results` \| `zero_results` \| `error`; `resultCount` | - | D-086 | Each debounced search request settles. |
| `barcode_scan_opened` | - | - | D-086 | The scanner sheet opens. |
| `barcode_scanned` | `status`: `found` \| `not_found` \| `invalid` \| `error` | - | D-086 | A barcode decodes (ISBN lookup result) or fails validation. |
| `manual_add_opened` | `reason`: `direct` \| `zero_results` \| `results_rejected` \| `search_error` \| `scan_miss` | - | D-086 | The manual form opens; the reason classifies what the reader was looking at (`addBookSignals.ts`). |
| `book_added` | `topicId`, `hasAuthor`, `hasMetadata`, `hasCover`, `viaIsbn`, `viaSearch` | book | PWA | A book row is created. |
| `book_opened` | - | book | PWA | The book screen mounts. |
| `book_finished` | - | book | PWA | Reader marks a book finished. |
| `difficulty_override_set` | `value` | book | D-06x | Manual difficulty override. |

### Capture (entries, dictation, search within a book)

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `dictation_started` | - | - | D-086 | Microphone session begins. |
| `dictation_finished` | `outcome`: `review` \| `empty` \| `error` \| `permission_denied` \| `start_failed`; `durationSeconds`; `chars` | - | D-086 | The take ends, for whatever reason. `chars` is the transcript length only. |
| `dictation_reviewed` | `outcome`: `confirmed` \| `discarded`; `chars` | - | D-086 | Reader accepts or throws away the review sheet. |
| `manual_entry_added` | `boundary`, `progressType`, `progressValue`, `captureMethod`: `voice` \| `typed`, `kind` | book | PWA / D-074 | An entry is saved. |
| `entry_draft_discarded` | `chars`, `hadTranscript`, `composerMode`, `kind` | book | D-086 | The composer is closed with unsaved text. |
| `entry_search_used` | `matches`, `zeroResults`, `entries` | book | D-086 | 900 ms after the reader stops typing a filter of 2+ characters in the book's entry list. |
| `entry_flag_applied` | `source` | book | D-04x | A suggested flag is applied. |
| `semantic_search_used` | `status`, `matches` | book | D-04x | Meaning search request settles. |
| `quote_favorited` | `entryId` | - | D-06x | |
| `quote_reflection_saved` | `entryId`, `words` | - | D-06x | |
| `character_map_saved` | `action`: `added` \| `updated`; `via` | book | PWA | |

### Reading timer

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `reading_session_completed` | `durationSeconds`, `plannedSeconds`, `pagesRead`, `completedPlan` | book | D-06x | |
| `reading_session_abandoned` | `elapsedSeconds`, `plannedSeconds` | book | D-06x | |
| `timer_character_prompt_used` | `mode` | book | D-077 | |
| `trophy_piece_unlocked` | `piece`, `source`: `entry` \| `timer` | book | D-06x | |
| `notification_permission_result` | `granted`, `context`: `reading_timer` | - | D-086 | Only when the OS prompt was actually shown (not when permission was already settled). |
| `exact_alarm_prompt` | `choice`: `not_now` \| `open_settings` | - | D-086 | Android 12+ exact-alarm explainer answered. |

### Companion and premium

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `companion_opened` | - | book | D-04x | |
| `companion_message_sent` | `status`: `succeeded` \| `error` \| error code | book | D-04x | |
| `companion_tool_used` | `tool`, `status`, tool-specific counts (`cards`, `found`, `moves`, ...) | book | D-04x | |
| `recap_teaser_tapped`, `recap_requested` | `detail`, `status`, `entryCount` | book | D-04x | |
| `paywall_hit` | `feature`: `companion` \| `club_lock` \| `match_lock` \| `summary_lock` \| ...; `reason`: `locked` \| `subscription` \| `quota` | book when known | D-086 | A locked card renders, or the server refuses a companion call for entitlement/quota reasons. |
| `subscription_viewed` | `entitled`, `state`, `source` (see below) | - | D-068 / D-086 | The Subscription screen mounts with a resolved entitlement. |
| `purchase_started` | `package`, `period`, `store_trial` | - | D-068 | |
| `purchase_completed` / `purchase_cancelled` / `purchase_failed` | `package` | - | D-068 | |
| `purchases_restored` | - | - | D-068 | |
| `trial_started` | `trial_days` | - | D-068 | |
| `trial_locked_viewed` | - | - | D-068 | **Retired** in D-074 (no call site; kept in the type for old rows). |
| `onboarding_finished` | `outcome`, `slides_seen`, `slides_total` | - | D-084 | |

`subscription_viewed.source` (from `paywallSource.ts`): `settings`,
`club_lock`, `match_lock`, `summary_lock`, `character_suggestions`,
`first_run_tour`, or `unknown` when the screen was reached some other way.
Every in-app route to `/subscription` goes through `openSubscription()`, so a
new entry point needs a new source string there, not a bare `router.push`.

### Settings and QR bookmarks

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `settings_action` | `action`: `change_password` \| `export` \| `delete_account` \| `sign_out` \| `open_bookmarks` \| `replay_tour` \| `report_issue` \| `privacy_policy`; `status` where meaningful (`sent` \| `failed` \| `shared` \| `confirmed`) | - | D-086 | Destructive actions log at the final confirmation, before the request, so the row survives sign-out/deletion. |
| `bookmark_scanned` | `status`: `opened_book` \| `unlinked` \| `unclaimed` \| `unregistered` \| `error` | book when linked | D-086 | Once per resolved lookup after a QR deep link (`scanOutcome.ts`). |
| `bookmark_action` | `action`: `claim` \| `register` \| `link`; `status`: `succeeded` \| `failed` | book on link | D-086 | |

### Diagnostics

`app_error` (D-030) is written by `lib/crashReporting.ts` directly, not through
`trackAnalyticsEvent`: `message`, `stack`, `fatal`, `platform`, `updateId`. It
is the only event allowed to carry free text, and that text is an error
message, never reader content.

## Useful queries

Run in the Supabase SQL editor (owner role). Replace the window as needed.

```sql
-- Daily active readers (last 30 days)
select date_trunc('day', created_at) as day, count(distinct user_id) as dau
from analytics_events
where event_name = 'app_opened' and created_at > now() - interval '30 days'
group by 1 order by 1;

-- Where the paywall is reached, and how often it converts to a view
select event_properties->>'feature' as feature, count(*) as hits
from analytics_events
where event_name = 'paywall_hit' and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

select event_properties->>'source' as source, count(*) as views
from analytics_events
where event_name = 'subscription_viewed' and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

-- Add-book funnel: searches that found nothing, and why readers went manual
select event_properties->>'status' as status, count(*)
from analytics_events where event_name = 'book_search_used' group by 1;

select event_properties->>'reason' as reason, count(*)
from analytics_events where event_name = 'manual_add_opened' group by 1;

-- Dictation health: how takes end, and how many reviews are thrown away
select event_properties->>'outcome' as outcome, count(*),
       round(avg((event_properties->>'durationSeconds')::numeric)) as avg_seconds
from analytics_events where event_name = 'dictation_finished' group by 1;

select event_properties->>'outcome' as outcome, count(*)
from analytics_events where event_name = 'dictation_reviewed' group by 1;

-- Which tabs and screens get attention (per reader, so one heavy user does not dominate)
select event_properties->>'screen' as screen,
       count(*) as views, count(distinct user_id) as readers
from analytics_events
where event_name = 'screen_viewed' and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

-- Timer permission: did the bell prompt get accepted?
select event_properties->>'granted' as granted, count(*)
from analytics_events where event_name = 'notification_permission_result' group by 1;
```

## Adding an event

1. Add the name to `AnalyticsEventName` in `analytics.ts` with a comment
   naming the decision.
2. Keep properties to statuses, modes and counts; put any classification
   logic in a pure module (`addBookSignals.ts`, `scanOutcome.ts`,
   `appOpen.ts`) with a unit test.
3. Pass the book's `topic_id` as the third argument whenever the event is
   about a book.
4. Add a row to this catalogue. Events added here do not need a migration -
   `event_name` is free text - and do not need to be mirrored in the PWA
   (the Netlify PWA is no longer kept in step with the native app).
5. Engagement streaks read a fixed list (`ENGAGEMENT_EVENT_NAMES` in
   `fitness/streaks.ts`); new events are *not* streak-bearing unless that
   list changes deliberately.
