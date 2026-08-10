export interface DailyHealthSnapshot {
  id: string
  date: string
  hrv_avg: number | null
  resting_hr: number | null
  sleep_score: number | null
  deep_sleep_minutes: number | null
  rem_sleep_minutes: number | null
  total_sleep_minutes: number | null
  sleep_efficiency: number | null
  body_temp_deviation: number | null
  steps: number | null
  active_calories: number | null
  basal_energy_burned: number | null
  blood_oxygen_saturation: number | null
  distance_km: number | null
  exercise_minutes: number | null
  flights_climbed: number | null
  body_mass: number | null
  readiness_score: number | null
  extras: Record<string, number> | null
  source: string
  raw: unknown
  created_at: string
}

export interface Workout {
  id: string
  date: string
  type: string | null
  duration_minutes: number | null
  avg_hr: number | null
  max_hr: number | null
  calories: number | null
  perceived_effort: number | null
  source: string
  raw: unknown
  created_at: string
}

export interface Note {
  id: string
  module: string
  body: string
  sentiment: string | null
  tags: string[] | null
  created_at: string
}

export interface HealthInsight {
  id: string
  week_starting: string
  summary: string | null
  patterns: string[] | null
  recommendations: string[] | null
  flags: string[] | null
  data_snapshot: unknown
  created_at: string
}

export interface NhpUser {
  id: string
  phone: string
  name: string
  role: string
  active: boolean
  created_at: string
}

export interface NhpProject {
  id: string
  code: string
  name: string
  active: boolean
  created_at: string
}

export interface NhpExpense {
  id: string
  project_id: string | null
  submitted_by: string | null
  vendor: string | null
  amount: number | null
  expense_date: string | null
  description: string | null
  payment_type: 'company_card' | 'reimbursable'
  image_url: string | null
  raw_sms: string | null
  created_at: string
}

export interface SmsPending {
  id: string
  from_number: string
  state: 'awaiting_project' | 'awaiting_payment_type' | 'awaiting_confirmation'
  parsed: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Dexcom ───────────────────────────────────────────────────────────────────

export interface DexcomEgv {
  id: number
  system_time: string
  display_time: string
  value_mgdl: number | null
  status: string | null
  trend: string | null
  trend_rate: number | null
  inserted_at: string
}

export interface DexcomAuth {
  id: number
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string | null
  last_synced_at: string | null
  updated_at: string
}

export interface DexcomEvent {
  id: number
  system_time: string
  display_time: string
  event_type: string
  event_subtype: string | null
  value: number | null
  unit: string | null
  inserted_at: string
}

// ─── T1D ─────────────────────────────────────────────────────────────────────

export type CaregiverRole = 'parent' | 'nurse' | 'grandparent' | 'camp' | 'other'

export interface T1dCaregiver {
  id: string
  name: string
  role: CaregiverRole
  pin: string | null
  active: boolean
  created_at: string
}

export interface LearnedStrategy {
  dose_pct: number
  extended_grams: number | null
  extended_hours: number | null
  n_meals: number
  pct_good: number
  avg_peak_mgdl: number | null
  avg_peak_minutes: number | null
  last_updated: string
}

export type GiCategory = 'low' | 'medium' | 'high'

export interface T1dFoodRepo {
  id: string
  name: string
  aliases: string[] | null
  serving_size: string
  serving_qty: number
  carbs_g: number
  fat_g: number | null
  protein_g: number | null
  calories: number | null
  gi_estimate: number | null
  gi_category: GiCategory | null
  category: string | null
  notes: string | null
  learned_strategy: LearnedStrategy | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface MealItem {
  food_repo_id: string | null
  name: string
  qty_offered: number
  qty_eaten: number | null
  carbs: number
  fat: number | null
  protein: number | null
}

export type MealContext = 'school_lunch' | 'home_dinner' | 'grandparent' | 'breakfast' | 'snack'

export interface T1dMealEvent {
  id: string
  timestamp: string
  context: MealContext
  items_offered: MealItem[]
  items_eaten: MealItem[] | null
  total_offered_carbs: number | null
  total_eaten_carbs: number | null
  total_fat_g: number | null
  total_protein_g: number | null
  fpu_count: number | null
  photo_url: string | null
  claude_analysis: unknown | null
  source: 'photo' | 'manual'
  is_cafeteria: boolean
  entered_by: string | null
  created_at: string
  updated_at: string
}

export interface T1dCafeteriaMenuItem {
  id: string
  menu_date: string
  name: string
  carbs_g: number
  category: 'entree' | 'side' | 'milk' | 'condiment' | null
  created_at: string
}

export interface IcrSegment {
  start: string  // "HH:MM"
  end: string    // "HH:MM"
  icr: number
}

export interface T1dEngineParams {
  id: string
  effective_from: string
  pre_bolus_pct: number
  pre_bolus_lead_min: number
  follow_up_coverage_pct: number
  activity_reduction_pct: number
  activity_window_min: number
  fpu_insulin_factor: number | null
  fpu_extension_hours: number | null
  low_carryover_reduction_pct: number | null
  current_icr: number | null
  icr_segments: IcrSegment[] | null
  current_isf: number | null
  current_dia: number | null
  target_bg: number | null
  insulin_type: string
  notes: string | null
  clinical_notes: string | null
  approved_by: string | null
  created_at: string
}

export interface T1dDailyOverride {
  id: string
  override_date: string
  camp_cancelled: boolean
  pe_cancelled: boolean
  pe_start_time: string | null
  pe_end_time: string | null
  recess_cancelled: boolean
  lunch_start_time: string | null
  snack_cancelled: boolean
  notes: string | null
  created_at: string
}

export interface T1dDoseSession {
  id: string
  meal_event_id: string | null
  engine_params_id: string | null
  timestamp: string
  recommended_dose_grams: number | null
  recommended_extended_grams: number | null
  recommended_extended_hours: number | null
  dose_delay_minutes: number | null
  wait_and_see: boolean
  wait_reason: string | null
  actual_dose_grams: number | null
  actual_dose_timestamp: string | null
  pump_suggested_units: number | null
  engine_reasoning: string | null
  engine_confidence: 'high' | 'medium' | 'low' | null
  context_snapshot: unknown | null
  starting_bg: number | null
  starting_trend: string | null
  low_treatment_type: string | null
  low_treatment_carbs: number | null
  meal_gi_category: GiCategory | null
  entered_by: string | null
  created_at: string
}

export type PendingDoseStatus = 'pending' | 'ready' | 'dosed' | 'cancelled'

export interface T1dPendingDose {
  id: string
  dose_session_id: string | null
  meal_event_id: string | null
  recommended_grams: number
  recommended_extended_grams: number | null
  recommended_extended_hours: number | null
  reason: string
  status: PendingDoseStatus
  resolved_at: string | null
  resolved_reason: string | null
  created_at: string
}

export interface T1dDoseOutcome {
  id: string
  session_id: string | null
  bg_at_1h: number | null
  bg_at_2h: number | null
  bg_at_3h: number | null
  bg_at_4h: number | null
  peak_bg: number | null
  peak_at_minutes: number | null
  nadir_bg: number | null
  nadir_at_minutes: number | null
  tir_4h_pct: number | null
  score_glucose_response: string | null
  score_tir: string | null
  score_bolus_timing: string | null
  score_stability: string | null
  score_overall: string | null
  score_notes: string | null
  outcome_rating: 'good' | 'too_high' | 'too_low' | 'low_alarm' | null
  computed_at: string
}

export interface T1dLowTreatment {
  id: string
  timestamp: string
  bg_at_treatment: number | null
  treatment_type: 'juice' | 'glucose_tabs' | 'candy' | 'other' | null
  treatment_carbs_g: number | null
  bg_30min_after: number | null
  source: 'manual' | 'chat' | 'sms_import' | 'auto_detected'
  entered_by: string | null
  notes: string | null
  created_at: string
}

export interface T1dEngineLearning {
  id: string
  learning_date: string
  meals_logged: number | null
  data_quality_note: string | null
  claude_observations: string | null
  claude_suggestions: unknown | null
  action_taken: 'approved' | 'rejected' | 'modified' | 'deferred' | null
  params_updated_id: string | null
  alexandra_notes: string | null
  created_at: string
}

export interface T1dSchoolSchedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  event_type: 'pe' | 'lunch' | 'snack' | 'breakfast' | 'recess' | 'playground' | 'swimming' | 'bedtime'
  activity_level: 'high' | 'medium' | 'low' | 'rest' | 'normal' | null
  notes: string | null
  active: boolean
  created_at: string
}

export type DeviceKind = 'cgm' | 'pod'

export interface T1dDeviceActive {
  id: string
  kind: DeviceKind
  model: string
  serial: string | null
  lot: string | null
  applied_at: string
  expires_at: string
  grace_ends_at: string | null
  site: string | null
  applied_by: string | null
  photo_url: string | null
  created_at: string
}

export interface T1dDeviceHistory extends T1dDeviceActive {
  ended_at: string | null
  end_reason: 'replaced' | 'failed_early' | null
  failure_note: string | null
  claim_submitted: boolean
  claim_submitted_at: string | null
}

export interface T1dChatMessage {
  id: string
  session_date: string
  role: 'caregiver' | 'engine'
  content: string
  intent: string | null
  logged_entity_type: string | null
  logged_entity_id: string | null
  entered_by: string | null
  created_at: string
}

// ─── Engine I/O ───────────────────────────────────────────────────────────────

export interface EngineInput {
  meal: MealItem[]
  last5Egvs: Pick<DexcomEgv, 'system_time' | 'value_mgdl'>[]
  scheduleNext2h: T1dSchoolSchedule[]
  recentFastCarbs: { carbs_g: number; logged_at: string } | null
  foodPlaybooks: Record<string, LearnedStrategy>
  similarFoodOutcomes: SimilarFoodOutcome[]
  params: T1dEngineParams
}

export interface SimilarFoodOutcome {
  name: string
  gi_estimate: number | null
  gi_category: GiCategory | null
  carbs_g: number
  fat_g: number | null
  protein_g: number | null
  n_meals: number
  pct_good: number
  avg_peak_mgdl: number | null
  avg_peak_minutes: number | null
}

export interface EngineOutput {
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
  pump_iob_note: string | null
}
