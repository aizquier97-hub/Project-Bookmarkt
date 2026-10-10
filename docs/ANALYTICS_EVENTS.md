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
**D-086** are the usage-coverage expansion; rows marked **D-087** are the
behaviour-depth expansion (salon flow, timer funnel, composer entry points,
Book Club shelf picks).

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
| `manual_entry_added` | `boundary`, `progressType`, `progressValue`, `captureMethod`: `voice` \| `typed`, `kind`, `source`: `composer` \| `timer` \| `salon` | book | PWA / D-074 / D-087 | An entry is saved. `source` (D-087) says whether it came from the book composer, the Sandglass wrap-up note, or a Socratic salon saved to the journal. |
| `composer_opened` | `target`: `entry` \| `character`; `mode`: `write` \| `speak`; `source`: `capture_bar` \| `timer_handoff` | book | D-087 | The entry or character composer opens, from the book's capture bar or a Sandglass hand-off param. Compare against `manual_entry_added` / `character_map_saved` for a per-mode completion rate. |
| `book_tab_viewed` | `tab`: `entries` \| `characters` \| `photos`; `entries`, `characters` (counts) | book | D-087 | The reader switches panes inside a book (the bottom tabs are `tab_viewed`). |
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
| `reading_session_started` | `plannedMinutes`, `customLength`, `hasStartPage`, `bellPermission`: `granted` \| `denied` \| `unavailable` | book | D-087 | The glass is turned. The denominator for the three outcomes below. |
| `reading_session_completed` | `durationSeconds`, `plannedSeconds`, `pagesRead`, `completedPlan` | book | D-06x | The wrap-up is saved (planned time reached or left early after 1+ min). |
| `reading_session_ended_early` | `elapsedSeconds`, `plannedSeconds` | book | D-087 | "Leave early" confirmed after at least a minute; the sitting still goes to wrap-up. |
| `reading_session_abandoned` | `elapsedSeconds`, `plannedSeconds` | book | D-06x | "Leave early" under a minute; nothing is logged. |
| `timer_wrapup_abandoned` | `elapsedSeconds`, `plannedSeconds`, `hadNote`, `hadEndPage` | book | D-087 | The reader left "Time's up" without saving - time was read but the sitting was lost. |
| `timer_next_step` | `choice`: `write_entry` \| `open_book` \| `profile`; `noteSaved`, `hasEndPage` | book | D-087 | Which door the reader takes from the saved screen. |
| `timer_character_prompt_used` | `mode` | book | D-077 | The "Did you meet someone new?" hand-off from the saved screen. |
| `trophy_piece_unlocked` | `piece`, `source`: `entry` \| `timer` | book | D-06x | |
| `notification_permission_result` | `granted`, `context`: `reading_timer` | - | D-086 | Only when the OS prompt was actually shown (not when permission was already settled). |
| `exact_alarm_prompt` | `choice`: `not_now` \| `open_settings` | - | D-086 | Android 12+ exact-alarm explainer answered. |

### Companion and premium

| Event | Properties | topic_id | Since | Fires |
| --- | --- | --- | --- | --- |
| `club_book_picked` | `shelfIndex`, `shelfSize`, `hasEntries`, `finished` | book | D-087 | A book is chosen on the Book Club tab, before the entitlement gate decides what the reader sees. |
| `recall_book_picked` | same shape | book | D-087 | A book is chosen on the Recall tab. |
| `companion_opened` | - | book | D-04x | |
| `salon_hub_viewed` | `salons` (completed), `discarded` (abandoned salons seen in the cache) | book | D-087 / D-098 | A returning reader lands on the orientation hub (first-timers go straight to the primer). |
| `companion_tool_used` (`tool: observations`) | `status`: `succeeded` \| `NO_ENTRIES` \| error code | book | D-087, D-099 | The grounded openers settle, once per visit - since D-099 they are fetched as soon as the hub shows, so this can fire before "Start a new discussion" is tapped. `NO_ENTRIES` is the "write a note first" dead end. |
| `salon_started` | `mode`: `new` \| `resumed`; `hasObservation`; `priorSalons` | book | D-087 / D-098 | "Start discussion", or "Continue this discussion" from the replay screen (`resumed`). |
| `companion_message_sent` | `status`: `succeeded` \| error code; on success also `turn` (1-3 arc position), `answerIndex` (1-based within the salon), `inputMethod`: `chip` \| `voice` \| `typed`, `chars`, `convergence` | book | D-04x / D-087 | Each answer sent. `inputMethod` is whichever seeded the draft first (a chip the reader then edited is still `chip`). |
| `salon_convergence_reached` | `answers`, `convergences` | book | D-087 | The synthesis card lands. |
| `salon_fork` | `choice`: `save_finish` \| `push_further` \| `continue_replay`; `answers` (or `cards` for `continue_replay`) | book | D-087 / D-098 | The reader's answer to the convergence fork, or "Continue this discussion" on the replay screen. |
| `salon_ended` | `reason`: `end_session` \| `wrap_up` \| `save_finish` \| `left`; `mode`, `answers`, `convergences`, `pushedFurther`, `durationSeconds`, `chip`, `voice`, `typed` | book | D-087 | Exactly once per salon: an explicit ending, or `left` when the screen unmounts mid-deck (`salonSignals.ts`). |
| `salon_journal_saved` | - | book | D-087 (retired D-098) | No longer emitted: the closing card has no "Save to journal"; insights live in the Book Club only. Old rows remain queryable. |
| `salon_discarded` | `reason`: `left` \| `empty` \| `stale` | book | D-098 | A discussion that never reached its insight is deleted: the reader left the deck, ended with nothing said, or the hub purged an older one. |
| `salon_replay_viewed` | `cards`, `hasInsight` | book | D-098 | The replay screen opens on a past discussion, once per visit. |
| `salon_archive_opened` | `index`, `total`, `pairs` | book | D-087 / D-098 | A past discussion's card is tapped on the hub (opens the replay screen). |
| `companion_tool_used` | `tool`, `status`, tool-specific counts (`cards`, `found`, `moves`, ...) | book | D-04x | |
| `recap_teaser_tapped` | `entryCount` | book | D-04x | "Where you left off" is opened (before entitlement is known). |
| `recap_viewed` | `entitled`, `hasStoredRecap`, `entryCount` | book | D-087 | What the open card actually showed once entitlement settled: the locked copy (also a `paywall_hit` with `feature: recap`), a stored recap, or the empty retell prompt. |
| `recap_detail_changed` | `detail`: `brief` \| `detailed`; `hasStoredRecap` | book | D-087 | The Brief/Detailed segment is switched. |
| `recap_requested` | `detail`, `status`, `entryCount` | book | D-04x | A retell is requested. |
| `paywall_hit` | `feature`: `companion` \| `recap` \| `club_lock` \| `match_lock` \| `summary_lock` \| ...; `reason`: `locked` \| `subscription` \| `quota` | book when known | D-086 / D-087 | A locked card renders, or the server refuses a companion call for entitlement/quota reasons. |
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

-- Time to first milestone (D-087): days from sign-up to each first-ever
-- action, per reader, then the median. Long gaps are the pain points.
with firsts as (
  select user_id, event_name, min(created_at) as first_at
  from analytics_events
  where event_name in ('book_added', 'manual_entry_added', 'reading_session_completed',
                       'companion_opened', 'salon_started', 'paywall_hit',
                       'subscription_viewed', 'purchase_completed')
  group by 1, 2
)
select f.event_name,
       count(*) as readers,
       round(percentile_cont(0.5) within group
             (order by extract(epoch from f.first_at - u.created_at) / 86400)::numeric, 1)
         as median_days_from_signup
from firsts f join auth.users u on u.id = f.user_id
group by 1 order by 3;

-- Sandglass funnel: started -> ended early / completed / abandoned / wrap-up lost
select event_name, count(*)
from analytics_events
where event_name in ('reading_session_started', 'reading_session_completed',
                     'reading_session_ended_early', 'reading_session_abandoned',
                     'timer_wrapup_abandoned')
  and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

-- Which session lengths readers pick, and after a sitting, where they go
select (event_properties->>'plannedMinutes')::int as minutes, count(*)
from analytics_events where event_name = 'reading_session_started' group by 1 order by 1;

select event_properties->>'choice' as next_step, count(*)
from analytics_events where event_name = 'timer_next_step' group by 1 order by 2 desc;

-- Socratic salons: how deep they go and how they end
select event_properties->>'reason' as ended_by,
       count(*) as salons,
       round(avg((event_properties->>'answers')::numeric), 1) as avg_answers,
       round(avg((event_properties->>'durationSeconds')::numeric) / 60, 1) as avg_minutes,
       sum((event_properties->>'convergences')::int) as convergences
from analytics_events
where event_name = 'salon_ended' and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

-- How readers answer the companion (chip vs voice vs typed) by arc position
select event_properties->>'turn' as turn, event_properties->>'inputMethod' as method, count(*)
from analytics_events
where event_name = 'companion_message_sent' and event_properties->>'status' = 'succeeded'
  and event_properties ? 'inputMethod'
group by 1, 2 order by 1, 3 desc;

-- Book Club door: shelf picks -> salons started -> locked (the premium case)
select
  count(*) filter (where event_name = 'club_book_picked') as picks,
  count(*) filter (where event_name = 'salon_started') as salons_started,
  count(*) filter (where event_name = 'paywall_hit'
                     and event_properties->>'feature' in ('companion', 'club_lock')) as locked,
  count(*) filter (where event_name = 'salon_replay_viewed') as replays_opened,
  count(*) filter (where event_name = 'salon_discarded') as discarded
from analytics_events where created_at > now() - interval '30 days';

-- "Where you left off": how often the open card is the locked copy
select event_properties->>'entitled' as entitled,
       event_properties->>'hasStoredRecap' as had_recap, count(*)
from analytics_events where event_name = 'recap_viewed' group by 1, 2;

-- Entry sources and composer completion by mode
select event_properties->>'source' as source, event_properties->>'captureMethod' as method, count(*)
from analytics_events where event_name = 'manual_entry_added' group by 1, 2 order by 3 desc;

select event_properties->>'target' as target, event_properties->>'mode' as mode,
       event_properties->>'source' as source, count(*) as opened
from analytics_events where event_name = 'composer_opened' group by 1, 2, 3 order by 4 desc;
```

## Adding an event

1. Add the name to `AnalyticsEventName` in `analytics.ts` with a comment
   naming the decision.
2. Keep properties to statuses, modes and counts; put any classification
   logic in a pure module (`addBookSignals.ts`, `scanOutcome.ts`,
   `appOpen.ts`, `salonSignals.ts`) with a unit test.
3. Pass the book's `topic_id` as the third argument whenever the event is
   about a book.
4. Add a row to this catalogue. Events added here do not need a migration -
   `event_name` is free text - and do not need to be mirrored in the PWA
   (the Netlify PWA is no longer kept in step with the native app).
5. Engagement streaks read a fixed list (`ENGAGEMENT_EVENT_NAMES` in
   `fitness/streaks.ts`); new events are *not* streak-bearing unless that
   list changes deliberately.
