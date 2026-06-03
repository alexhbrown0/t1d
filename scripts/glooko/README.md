# Glooko Sync

Daily Glooko export automation:

```text
Glooko web export -> local ZIP parser -> Supabase upsert
```

## Environment

Add these to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GLOOKO_TIMEZONE=America/Chicago
GLOOKO_URL=https://my.glooko.com
```

Optional:

```bash
GLOOKO_EMAIL=...
GLOOKO_PASSWORD=...
GLOOKO_EXPORT_URL=...
GLOOKO_EXPORT_SELECTOR=...
GLOOKO_HEADLESS=true
```

`GLOOKO_EXPORT_URL` and `GLOOKO_EXPORT_SELECTOR` are for calibrating the exact Glooko CSV export screen/button if the default text search does not find it.

## Commands

First login/session setup:

```bash
npm run glooko:login
```

Daily sync:

```bash
npm run glooko:sync
```

Import an already downloaded export:

```bash
npm run glooko:import -- /path/to/export.zip
```

Downloaded ZIPs are saved in `scripts/glooko/downloads`. Browser auth/session data is saved in `scripts/glooko/.auth`. Both are gitignored.

## Scheduling

Use the `launchd` plist example in this folder after confirming `npm run glooko:sync` works interactively.
