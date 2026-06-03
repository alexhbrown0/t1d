# Brooks — T1D App: Codex Reference

> Full technical and design reference for the Brooks T1D management app.
> Last updated: June 2026

---

## What This Is

A personal T1D management app built for **Brooks**, a child with Type 1 Diabetes on **Omnipod 5** (pump) + **Dexcom G7** (CGM) + **Fiasp** insulin. Alexandra (his mom) is the primary user. The school nurse has a simplified view. No other roles exist — the persona/account-type system was removed.

**Core purpose:** Give Brooks's caregivers clear, context-aware dosing guidance for every meal. The app reads real-time CGM data, knows his school schedule and PE days, and uses a Claude-powered engine to recommend how many grams to enter into the pump.

**Key output is always carb grams, not insulin units.** The app tells caregivers "enter 42g into the pump." The pump's ICR converts that to units automatically. Caregivers optionally log the units the pump showed.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| UI primitives | shadcn/ui (Base UI), lucide-react |
| Backend/DB | Supabase (project `unrsjchzdnfwbzhozekb`) |
| AI | Anthropic SDK (`claude-sonnet-4-6`) |
| Deployment | Vercel |
| Fonts | Geist Sans, Geist Mono, Playfair Display (italic) |

**RLS is disabled** on all T1D tables. The service role key is used server-side only, never exposed to the client.

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY       # server-side only, never client
ANTHROPIC_API_KEY
CRON_SECRET                     # server-side only, never client
DEXCOM_CLIENT_ID
DEXCOM_CLIENT_SECRET
DEXCOM_REDIRECT_URI
```

`CRON_SECRET` guards all Vercel cron endpoints. Never expose it to the browser.

---

## Design System

**Theme:** Dark. Background `#0a0a0a`, cards `#141414`, borders `white/5` or `white/10`.

**Accent color:** Teal — `#2dd4bf` / `teal-400` / `teal-500`. Used for active states, dosing callouts, key labels.

**Typography:**
- Labels/eyebrows: `text-[10px] tracking-widest font-semibold uppercase text-gray-500` (or `text-teal-400` when active)
- Body: `text-sm text-white` or `text-gray-300`
- Big numbers (dose grams): `text-5xl font-bold text-white`
- App wordmark: `font-playfair text-2xl italic text-white` → "Brooks."

**Card pattern:**
```tsx
<div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3">
```
Active/dosing cards use `border-teal-500/30` instead.

**Buttons:**
- Primary action: `bg-teal-500 text-black font-bold py-4 rounded-2xl`
- Secondary: `bg-white/5 border border-white/10 text-white font-semibold py-3.5 rounded-xl`
- Destructive/warn: `bg-red-500/10 border border-red-500/30 text-red-300`
- Link-as-button: always use `<Link className="block ...">` — never nest `<button>` inside `<Link>` (causes width collapse on iOS)

**Layout:** Single-column, `max-w-lg mx-auto`, mobile-first PWA. `height: 100dvh`. Content scrolls above a fixed bottom nav.

**Bottom nav tabs:** Now · Assist · Schedule · Log · Engine

---

## File Structure

```
app/
  layout.tsx                        # Root layout, fonts, dark bg
  page.tsx                          # Redirects to /now
  (app)/
    layout.tsx                      # Adds BottomNav, max-w-lg scroll container
    now/page.tsx                    # Home screen (server component)
    lunch/page.tsx                  # Dedicated lunch execution view (server → LunchFlow)
    chat/page.tsx                   # AI assistant chat
    schedule/page.tsx               # School schedule management
    log/
      page.tsx                      # Log hub
      bolus/page.tsx
      low/page.tsx
      activity/page.tsx
      correction/page.tsx
    engine/
      page.tsx                      # Dosing engine tabs (TODAY/LUNCH/FOODS/DATA/ENGINE)
      lunch/page.tsx                # Planning view: build today's lunch
      foods/page.tsx                # Food repo browser
      learnings/page.tsx            # Daily learning review
  api/
    auth/dexcom/route.ts            # Dexcom OAuth redirect
    auth/dexcom/callback/route.ts   # OAuth callback, stores tokens
    ingest/dexcom/route.ts          # Cron: poll Dexcom /egvs every 5 min
    ingest/glooko/route.ts          # Manual Glooko CSV upload
    cron/t1d-outcomes/route.ts      # Hourly: score meal outcomes from BG trajectory
    cron/t1d-learning/route.ts      # Triggers daily learning
    claude/t1d-daily-learning/route.ts  # 7pm cron: observations + parameter suggestions
    t1d/
      engine/route.ts               # POST: run dose engine, create dose session
      engine-params/route.ts        # GET/POST engine parameters
      meal/route.ts                 # POST: create meal event
      meal/[id]/route.ts            # PATCH: update items_eaten after eating
      dose-session/route.ts         # GET: list dose sessions
      dose-session/[id]/confirm/route.ts  # POST: confirm dose given + units
      lunch/today/route.ts          # GET: full lunch state (phase + all data)
      lunch/estimate-remaining/route.ts   # POST: Claude vision → remaining food
      lunch/follow-up/route.ts      # POST: calculate follow-up dose
      food-repo/route.ts            # GET/POST food repository
      food-repo/[id]/route.ts       # PATCH/DELETE individual food
      carb-estimate/route.ts        # POST: Claude vision → itemized carb list
      insight/route.ts              # GET: AI-generated home screen insight
      chat/route.ts                 # POST: AI assistant (streaming)
      bg-latest/route.ts            # GET: latest Dexcom reading
      low-treatments/route.ts       # GET/POST low treatment log
      correction/route.ts           # POST: correction dose
      activity/route.ts             # POST: log activity
      recipes/route.ts              # GET/POST/PATCH/DELETE saved recipes
      learnings/route.ts            # GET learnings
      learnings/run/route.ts        # POST: manually trigger learning
      device-changes/route.ts       # GET/POST device settings changes

lib/
  claude/client.ts                  # Anthropic SDK singleton
  claude/prompts/t1d.ts             # Dose engine system prompt + user context builder
  claude/prompts/t1d-learning.ts    # Daily learning prompt
  dexcom/auth.ts                    # OAuth token exchange + refresh
  dexcom/client.ts                  # Dexcom API fetch wrapper (auto-refreshes token)
  supabase/server.ts                # createServerClient() with service role
  supabase/client.ts                # createBrowserClient() with anon key
  supabase/queries/t1d.ts           # Shared DB query helpers
  t1d/engine.ts                     # runDoseEngine(): pure async fn → EngineOutput
  t1d/fpu.ts                        # computeFpu(fat_g, protein_g) → FPU count
  t1d/schedule.ts                   # getScheduleNext2h(), getImminentHighActivity()
  t1d/outcome-scorer.ts             # Score meal outcomes A–F
  t1d/pending-dose-monitor.ts       # Monitor pending doses for stale states

components/t1d/
  app-header.tsx                    # "Brooks. / HIGHS & LOWS" wordmark
  bottom-nav.tsx                    # Fixed bottom tab bar
  bg-card.tsx                       # CGM sparkline + current BG
  bg-display.tsx                    # BG number + trend arrow display
  lunch-flow.tsx                    # Full lunch state machine (client component)
  lunch-tile.tsx                    # Compact lunch status tile
  insight-tile.tsx                  # AI insight tile (home screen)
  engine-today.tsx                  # Engine > TODAY tab content
  engine-lunch-entry.tsx            # Engine > LUNCH tab entry point
  engine-params.tsx                 # Engine > ENGINE tab (params editor)
  engine-data.tsx                   # Engine > DATA tab
  next-up-card.tsx                  # Next school event card
  quick-actions.tsx                 # Home screen quick action buttons
  dose-lunch-tile.tsx               # Dose session summary tile
  device-card.tsx / device-strip.tsx / device-modal.tsx  # Device status UI
```

---

## Database Tables

All in Supabase project `unrsjchzdnfwbzhozekb`. RLS disabled on all T1D tables.

### Core T1D tables

**`t1d_food_repo`** — 117+ items as of June 2026
```sql
id uuid PK
name text NOT NULL
aliases text[]
serving_size text          -- '1 cracker', '1 oz', '1 bottle (16 fl oz)'
serving_qty numeric        -- always 1; app multiplies carbs × quantity consumed
carbs_g numeric NOT NULL   -- per serving_size
fat_g numeric
protein_g numeric
calories numeric
gi_estimate numeric
gi_category text           -- 'low' | 'medium' | 'high'
category text              -- 'fruit' | 'grain' | 'snack' | 'drink' | 'meal' | 'candy' | 'dessert' | 'protein' | 'vegetable'
notes text
learned_strategy jsonb     -- {dose_pct, n_meals, pct_good, avg_peak_mgdl, ...}
active boolean DEFAULT true
created_at / updated_at
```

**Serving size rules:** Loose items (crackers, chips, berries) → per oz or per piece. Single-serve sealed units (juice box, pouch, granola bar) → per unit. Variable-size items (soda, OJ) → per fl oz. Cut items ≤2g carbs per serving.

**`t1d_meal_events`**
```sql
id uuid PK
timestamp timestamptz
context text               -- 'school_lunch' | 'home_dinner' | 'grandparent' | 'breakfast' | 'snack'
items_offered jsonb        -- MealItem[]
items_eaten jsonb          -- MealItem[] (filled after eating)
total_offered_carbs numeric
total_eaten_carbs numeric
total_fat_g / total_protein_g numeric
fpu_count numeric
photo_url text
claude_analysis jsonb
source text                -- 'photo' | 'manual'
entered_by text
```

**`t1d_dose_sessions`**
```sql
id uuid PK
meal_event_id uuid → t1d_meal_events
engine_params_id uuid → t1d_engine_params
timestamp timestamptz
recommended_dose_grams numeric
recommended_extended_grams numeric
recommended_extended_hours numeric
dose_delay_minutes int
wait_and_see boolean
wait_reason text
actual_dose_grams numeric  -- set when caregiver confirms
actual_dose_timestamp timestamptz
pump_suggested_units numeric  -- insulin units the pump showed (logged by caregiver)
engine_reasoning text
engine_confidence text     -- 'high' | 'medium' | 'low'
context_snapshot jsonb     -- {flags, is_followup, pre_bolus_session_id, ...}
starting_bg / starting_trend
entered_by text
```

Two sessions per meal_event = pre-bolus + follow-up. Identify follow-up by `context_snapshot->>'is_followup' = 'true'` or by ordering `created_at` ascending and taking index > 0.

**`t1d_engine_params`**
```sql
id uuid PK
effective_from date
pre_bolus_pct numeric          -- fraction of carbs for first dose (e.g. 0.40)
pre_bolus_lead_min int         -- minutes before eating (0 = dose at meal time)
follow_up_coverage_pct numeric -- fraction of remaining carbs for follow-up
activity_reduction_pct numeric -- reduction when PE is imminent
activity_window_min int        -- how far ahead to look for PE
fpu_insulin_factor numeric
fpu_extension_hours numeric
low_carryover_reduction_pct numeric
current_icr numeric            -- insulin-to-carb ratio (reference only, pump handles it)
icr_segments jsonb             -- [{start, end, icr}] for time-of-day ICR
current_isf numeric
current_dia numeric            -- duration of insulin action (hours)
target_bg numeric
insulin_type text              -- 'fiasp' | 'novolog' | 'humalog'
notes text
clinical_notes text            -- injected into engine system prompt
approved_by text               -- always 'alexandra'
```

**`t1d_school_schedule`** — recurring events (PE, lunch, recess) by day_of_week + time

**`t1d_daily_overrides`** — one row per date for PE cancellations, time changes

**`t1d_pending_doses`** — doses flagged for monitoring (BG dropping, wait-and-see)
```sql
status: 'pending' | 'ready' | 'dosed' | 'cancelled'
```

**`t1d_low_treatments`** — when lows were treated and with what

**`t1d_engine_learnings`** — daily Claude observations + suggested parameter changes + Alexandra's decision

**`t1d_dose_outcomes`** — BG trajectory scored A–F after each meal

**`t1d_recipes`** — saved meal plans / lunch combos

### Dexcom tables

**`dexcom_egvs`** — real-time CGM readings (5-min polling, `unique(system_time)`)
```sql
value_mgdl numeric, trend text, trend_rate numeric, system_time timestamptz
```

**`dexcom_auth`** — singleton row (`id=1`) with OAuth tokens + `expires_at`

**`dexcom_events`** — user-logged events from Dexcom app (carbs, insulin, exercise)

---

## Key Types

```typescript
interface MealItem {
  food_repo_id: string | null
  name: string
  qty_offered: number
  qty_eaten: number | null
  carbs: number        // per serving — multiply by qty for total
  fat: number | null
  protein: number | null
}

interface EngineOutput {
  dose_now_grams: number
  extended_bolus: { grams: number; over_hours: number } | null
  hold_for_activity: boolean
  wait_and_see: boolean
  wait_reason: string | null
  dose_delay_minutes: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  flags: string[]
  pump_iob_flag: boolean
}
```

All types are in `types/health.ts`.

---

## The Dose Engine

**Entry point:** `lib/t1d/engine.ts` → `runDoseEngine(meal: MealItem[], ctx?): Promise<EngineOutput>`

**What it does:**
1. Fetches current engine params, last 5 CGM readings, school schedule for next 2h, recent fast carbs, recent boluses, food repo
2. Builds a system prompt (with `clinical_notes` from params injected verbatim) and a user context string
3. Calls `claude-sonnet-4-6` with the context
4. Returns structured JSON matching `EngineOutput`

**Prompt cache:** The system prompt is sent with `cache_control: { type: 'ephemeral' }` to cache across calls.

**Warsaw method (FPU):** `lib/t1d/fpu.ts` → `computeFpu(fat_g, protein_g)` = `((fat × 9) + (protein × 4)) / 100`. High FPU meals trigger extended dose flags.

**Engine output is carb grams, not insulin units.** Alexandra enters grams into the Omnipod 5's manual bolus; the pump applies ICR.

---

## Lunch Execution Flow (`/lunch`)

The dedicated lunch view at `/lunch` is the day-of workflow. `/engine` > LUNCH tab is the morning planning/packing view.

**Phase state machine** (inferred server-side in `/api/t1d/lunch/today`):

| Phase | Condition |
|---|---|
| `no_lunch` | No `school_lunch` meal event today |
| `packed` | Meal event exists, no dose session |
| `pre_dose_ready` | Dose session exists, `actual_dose_grams` is null |
| `eating` | First dose confirmed, `items_eaten` not yet set |
| `followup_pending` | `items_eaten` set, no second session yet |
| `followup_ready` | Second (follow-up) session exists, not confirmed |
| `complete` | Follow-up session confirmed |

**Key endpoints for the lunch flow:**
- `GET /api/t1d/lunch/today` — returns `{ meal, session, follow_up_session, bg, schedule, override, phase }`
- `POST /api/t1d/engine` — triggers dose calculation, creates first `t1d_dose_sessions` row
- `POST /api/t1d/dose-session/[id]/confirm` — confirms dose given, records `pump_suggested_units`
- `PATCH /api/t1d/meal/[id]` — records `items_eaten` (totalEatenCarbs = `carbs × qty_eaten`)
- `POST /api/t1d/lunch/estimate-remaining` — multipart photo → Claude vision → estimated `items_eaten`
- `POST /api/t1d/lunch/follow-up` — calculates follow-up dose, creates second session
- Two sessions with same `meal_event_id`: first = pre/at-meal dose, second = follow-up (has `context_snapshot.is_followup = true`)

---

## Data Sources

| Source | What | Freshness | How |
|---|---|---|---|
| Dexcom API | Real-time CGM (EGVs, trend) | 5 min | Vercel cron → `dexcom_egvs` |
| Glooko | Omnipod 5 pump data (boluses, basal) | ~24h | Python/Selenium scrape → POST `/api/ingest/glooko` |
| Manual entry | Meals, lows, doses, notes | Real-time | In-app forms |

---

## Vercel Crons

| Path | Schedule | Purpose |
|---|---|---|
| `/api/ingest/dexcom` | Every 5 min | Poll Dexcom API, upsert to `dexcom_egvs` |
| `/api/cron/t1d-outcomes` | Hourly | Score completed meal outcomes from BG trajectory |
| `/api/claude/t1d-daily-learning` | 7pm daily | Observations + parameter suggestions → `t1d_engine_learnings` |

All cron routes require `Authorization: Bearer ${CRON_SECRET}` header.

---

## Dexcom OAuth

- Scope: `offline_access egv`
- Production mode (`DEXCOM_SANDBOX=false`)
- Token stored in `dexcom_auth` table (singleton row `id=1`)
- `lib/dexcom/auth.ts` handles exchange + refresh
- `lib/dexcom/client.ts` auto-refreshes expired tokens before API calls
- OAuth flow: `GET /api/auth/dexcom` → redirect → `GET /api/auth/dexcom/callback`

---

## Home Screen (`/now`)

Server component. On **weekdays (Mon–Fri)** shows a lunch status tile above the AI insight tile. Tile states:
- `NOT PACKED` → links to `/engine`
- `READY TO DOSE` → links to `/lunch`
- `IN PROGRESS` → links to `/lunch`
- `DONE` → links to `/lunch`

Components rendered:
1. `AppHeader` — "Brooks. / HIGHS & LOWS" wordmark only (no user pill)
2. `BgCard` — CGM sparkline + current value
3. Lunch tile (weekdays)
4. `InsightTile` — AI-generated contextual insight, links to `/lunch` or `/chat`
5. `QuickActions`
6. `NextUpCard` (if a school event is coming up today)

---

## Important Conventions

**Server components** use `createServerClient()` from `lib/supabase/server.ts` (service role).
**Client components** use `createBrowserClient()` from `lib/supabase/client.ts` (anon key) — but most data fetching goes through API routes.

**`export const dynamic = 'force-dynamic'`** is required on any page/route that reads live data (Dexcom, sessions, BG).

**Link + button:** Never nest `<button>` inside `<Link>`. The `<a>` tag is inline, making `w-full` on the button resolve to text width and collapsing the layout. Always use `<Link className="block w-full ...">` directly.

**`MealItem.carbs` is per-serving.** Total = `carbs × qty_offered` (offered) or `carbs × qty_eaten` (eaten). Several places multiply this — always verify which side of the equation you're on.

**Engine outputs carb grams.** ICR lives in the pump, not the app. Never calculate insulin units in the app — only log what the pump reported.

**Fat-protein units (FPU):** `((fat_g × 9) + (protein_g × 4)) / 100`. Meals with >2 FPU get an extended dose flag. Pizza, cheeseburgers, mac & cheese are common triggers.

**Serving size philosophy:** Always use a unit that can be scaled by the caregiver — per oz, per piece, per fl oz, per pouch/bar/bottle (if always consumed whole). Never per-handful or per-serving-of-arbitrary-count.

**Food repo deduplication:** 117 items as of June 2026 (49 from Target PDF 1+2, 28 from Target PDF 3, 40 from Walmart). Common cross-store duplicates have been removed. Dave's Killer Bread in DB is the 21 Whole Grains Thin-Sliced variety (14g carbs/slice).
