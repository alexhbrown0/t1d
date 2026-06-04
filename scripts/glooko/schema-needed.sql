-- Run in Supabase SQL editor before expanding the Glooko importer.
-- The nightly importer needs event timestamps and unique indexes so repeated
-- nightly exports can upsert instead of duplicating rows.

alter table public.glooko_bg
  add column if not exists timestamp timestamptz,
  add column if not exists glucose_mgdl numeric;

create unique index if not exists glooko_bg_export_key
  on public.glooko_bg (timestamp, glucose_mgdl, serial_number);

alter table public.glooko_alarms
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_alarms_export_key
  on public.glooko_alarms (timestamp, alarm_event, serial_number);

alter table public.glooko_basal
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_basal_export_key
  on public.glooko_basal (timestamp, insulin_type, duration_minutes, rate, insulin_delivered_u, serial_number);

alter table public.glooko_carbs
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_carbs_export_key
  on public.glooko_carbs (timestamp, carbs_g);

alter table public.glooko_food
  add column if not exists timestamp timestamptz,
  add column if not exists num_servings numeric;

create unique index if not exists glooko_food_export_key
  on public.glooko_food (timestamp, name, carbs_g, serving_quantity);

alter table public.glooko_exercise
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_exercise_export_key
  on public.glooko_exercise (timestamp, name, intensity, duration_minutes);

alter table public.glooko_medication
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_medication_export_key
  on public.glooko_medication (timestamp, name, value, medication_type);

alter table public.glooko_notes
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_notes_export_key
  on public.glooko_notes (timestamp, value);

alter table public.glooko_manual_insulin
  add column if not exists timestamp timestamptz;

create unique index if not exists glooko_manual_insulin_export_key
  on public.glooko_manual_insulin (timestamp, name, value, insulin_type);

create table if not exists public.glooko_insulin_totals (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null,
  total_bolus_u numeric,
  total_insulin_u numeric,
  total_basal_u numeric,
  serial_number text,
  inserted_at timestamptz not null default now()
);

create unique index if not exists glooko_insulin_totals_export_key
  on public.glooko_insulin_totals (timestamp, total_bolus_u, total_insulin_u, total_basal_u, serial_number);
