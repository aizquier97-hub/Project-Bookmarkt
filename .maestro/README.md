# Bookmarkt device automation (Stage 3)

Automated on-device smoke flows using [Maestro](https://maestro.mobile.dev),
the YAML-based mobile UI test runner. These cover the golden path the manual
smoke test walks: sign in → add a book → log an entry.

## One-time setup (owner)

1. Install Maestro (Windows, PowerShell):
   `iwr https://get.maestro.mobile.dev/install.ps1 -UseBasicParsing | iex`
   (or on macOS/Linux: `curl -Ls https://get.maestro.mobile.dev | bash`)
2. Connect your Android phone with USB debugging enabled (the same setup
   used for `adb`), or start an emulator.
3. Install the Bookmarkt preview build on the device.

## Running the flows

From the repository root:

```powershell
$env:MAESTRO_TEST_EMAIL = "<your test account email>"
$env:MAESTRO_TEST_PASSWORD = "<your test account password>"
maestro test .maestro/
```

Flows run in filename order. Use a **test account, not your real reading
account** — the add-book flow creates a book named "Maestro Smoke Test" and
logs one entry in it (delete it from the app afterwards, or keep it for the
next run; the flow tolerates it already existing).

## Flows

| File | What it proves |
| --- | --- |
| `01-sign-in.yaml` | Cold launch reaches the auth screen; credentials sign in; the Library tab renders. |
| `02-add-book.yaml` | The add-book form saves and the new book appears in the library grid. |
| `03-log-entry.yaml` | Opening the book and saving a one-line entry works end to end. |

CI note (roadmap §11): these same flows can run headless on an emulator in
GitHub Actions via `mobile-dev-inc/action-maestro-cloud` or a plain emulator
job once the project has CI hardware budget; for Stage 3 the owner-run local
pass is the acceptance bar.
