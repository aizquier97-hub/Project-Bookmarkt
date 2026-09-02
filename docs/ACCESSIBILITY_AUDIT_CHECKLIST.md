# Accessibility Audit Checklist (Stage 3, owner-run)

| Field | Value |
| --- | --- |
| Purpose | The manual WCAG 2.2 AA audit required by the Stage 3 work plan |
| Build | Android EAS preview build (the app you daily-drive) |
| Who | Product owner |
| How to report | Fill in the Result column per test (PASS / FAIL + notes), then review line by line with the assistant; failures get triaged as defects before the Stage 3 exit gate |

This audit is conducted manually, not by tooling alone: turn on the
phone's screen reader and deliberately complete real tasks with it - not
just everyday app use.

## One-time setup

- **TalkBack** (tests 1-5): phone Settings → Accessibility → TalkBack → on.
    - Single tap selects an item and reads it aloud.
    - Double-tap activates the selected item.
    - Swipe right/left moves to the next/previous item.
    - To turn TalkBack off again: hold both volume keys, or Settings →
    Accessibility → TalkBack → off.
- **Text size** (test 6): Settings → Display → Font size → largest.
- **Remove animations** (test 7): Settings → Accessibility → Remove
  animations (wording varies by phone) → on.

## The 8 tests

### 1. Sign-in screen (TalkBack on)

Sign out first (Settings tab → Sign out), then work through the sign-in
screen using only TalkBack.

- [x] Every field and button announces a clear label - never just
      "button" or silence.
- [x] You can tell what you have typed in the email and password fields.
- [x] Enter a wrong password on purpose: the error message is read aloud
      automatically, without hunting for it.

**Result:** The sign in screen is looking good, there are no issues.

### 2. Adding a book (TalkBack on)

- [x] The + button on the Library tab is announced clearly.
- [x] The "Scan the barcode" card and the scan screen are usable, and you
      can always escape back to manual entry.
- [ ] Manual entry (title, author, pages) works completely with TalkBack
      alone - this path must be fully usable since scanning may require
      sight.
- [x] The cover picker announces each cover candidate.

**Result:**

### 3. Library home (TalkBack on)

- [ ] Each book cover in the grid announces at least its title.
- [ ] The three bottom tabs - Library, Bookmarks, Settings - are clearly
      labeled and announce which one is selected.
- [ ] The stats chips and the Continue Reading card read sensibly.
- [ ] On a brand-new account: the welcome text and the "Add your first
      book" button read clearly.

**Result:**

### 4. Book screen - entries and characters (TalkBack on)

- [ ] The Edit button, the "Mark as finished" pill, and the
      Entries/Characters/Photos tabs are clearly labeled.
- [ ] Writing and saving a typed entry works fully with TalkBack.
- [ ] Voice capture: the recording state is announced, not shown by
      color alone.
- [ ] Search your entries, then select a result: highlighted matches
      still read as plain text.

**Result:**

### 5. Settings and sign-out (TalkBack on)

- [ ] Every row on the Settings tab is announced (account, bookmarks,
      report an issue, version).
- [ ] Tap Sign out: the confirmation dialog is read aloud automatically,
      and both dialog buttons are labeled.

**Result:**

### 6. Largest text size (TalkBack off)

With the font size at maximum, revisit: sign-in, the Library tab, a book
screen, add-book, and Settings.

- [ ] Nothing is cut off, overlapping, or impossible to tap.
- [ ] All button labels are still fully readable.

**Result:**

### 7. Remove animations (TalkBack off)

With animations removed, use the app normally for a few minutes.

- [ ] Cover press feedback, tab switches, and toasts degrade gracefully -
      nothing looks broken or stuck.

**Result:**

### 8. Color contrast in bright light (TalkBack off)

Take the phone outdoors or under a bright lamp at typical brightness.

- [ ] Book titles, progress percentages, entry text, and button labels
      all stay legible on the Library tab and the book screen.

**Result:**

## When you are done

Bring the filled-in results back to the session. Every FAIL becomes a
defect, gets fixed, and its test is re-run before the Stage 3 exit gate
(STAGE_GATES.md). The roadmap's Stage 3 work plan links here as the
authoritative test list.
