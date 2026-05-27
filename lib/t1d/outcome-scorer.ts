import type { DexcomEgv } from '@/types/health'

export interface OutcomeScores {
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
  score_notes: string
  outcome_rating: 'good' | 'too_high' | 'too_low' | 'low_alarm' | null
}

const TARGET_LOW = 70
const TARGET_HIGH = 180

function closestBgAt(egvs: DexcomEgv[], doseTime: Date, targetMinutes: number): number | null {
  const targetMs = doseTime.getTime() + targetMinutes * 60 * 1000
  const window = 10 * 60 * 1000 // ±10 min
  const candidates = egvs.filter(e => {
    const t = new Date(e.system_time).getTime()
    return Math.abs(t - targetMs) <= window && e.value_mgdl != null
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) =>
    Math.abs(new Date(a.system_time).getTime() - targetMs) -
    Math.abs(new Date(b.system_time).getTime() - targetMs)
  )
  return candidates[0].value_mgdl
}

function letterGrade(score: number): string {
  if (score >= 0.9) return 'A'
  if (score >= 0.75) return 'B'
  if (score >= 0.6) return 'C'
  if (score >= 0.4) return 'D'
  return 'F'
}

export function scoreOutcome(egvs: DexcomEgv[], doseTime: Date): OutcomeScores {
  const doseMs = doseTime.getTime()
  const window4h = egvs.filter(e => {
    const t = new Date(e.system_time).getTime()
    return t >= doseMs && t <= doseMs + 4 * 60 * 60 * 1000 && e.value_mgdl != null
  })

  const bg1h = closestBgAt(egvs, doseTime, 60)
  const bg2h = closestBgAt(egvs, doseTime, 120)
  const bg3h = closestBgAt(egvs, doseTime, 180)
  const bg4h = closestBgAt(egvs, doseTime, 240)

  let peakBg: number | null = null
  let peakAtMs: number | null = null
  let nadirBg: number | null = null
  let nadirAtMs: number | null = null

  for (const egv of window4h) {
    const v = egv.value_mgdl!
    const t = new Date(egv.system_time).getTime()
    if (peakBg === null || v > peakBg) { peakBg = v; peakAtMs = t }
    if (nadirBg === null || v < nadirBg) { nadirBg = v; nadirAtMs = t }
  }

  const peakAtMinutes = peakAtMs != null ? Math.round((peakAtMs - doseMs) / 60000) : null
  const nadirAtMinutes = nadirAtMs != null ? Math.round((nadirAtMs - doseMs) / 60000) : null

  const inRange = window4h.filter(e => e.value_mgdl! >= TARGET_LOW && e.value_mgdl! <= TARGET_HIGH)
  const tir4hPct = window4h.length > 0 ? Math.round((inRange.length / window4h.length) * 100) / 100 : null

  if (window4h.length < 4) {
    return {
      bg_at_1h: bg1h, bg_at_2h: bg2h, bg_at_3h: bg3h, bg_at_4h: bg4h,
      peak_bg: peakBg, peak_at_minutes: peakAtMinutes,
      nadir_bg: nadirBg, nadir_at_minutes: nadirAtMinutes,
      tir_4h_pct: tir4hPct,
      score_glucose_response: null, score_tir: null, score_bolus_timing: null,
      score_stability: null, score_overall: null,
      score_notes: 'Not enough CGM data in the 4-hour window to score this meal.',
      outcome_rating: null,
    }
  }

  // Score: glucose response — peak height and timing
  const peakScore = (() => {
    if (peakBg == null) return 0.5
    if (peakBg <= 160) return 1.0
    if (peakBg <= 180) return 0.8
    if (peakBg <= 220) return 0.5
    if (peakBg <= 260) return 0.25
    return 0
  })()

  // Score: TIR
  const tirScore = tir4hPct ?? 0

  // Score: bolus timing — did BG stay under 200 in the first 90 min?
  const first90 = window4h.filter(e => {
    const t = new Date(e.system_time).getTime()
    return t <= doseMs + 90 * 60 * 1000
  })
  const timingScore = first90.length > 0
    ? first90.filter(e => e.value_mgdl! <= 200).length / first90.length
    : 0.5

  // Score: stability — standard deviation over 4h window
  const values = window4h.map(e => e.value_mgdl!)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sd = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length)
  const stabilityScore = (() => {
    if (sd <= 20) return 1.0
    if (sd <= 35) return 0.8
    if (sd <= 50) return 0.6
    if (sd <= 70) return 0.35
    return 0.1
  })()

  const overallScore = (peakScore * 0.3 + tirScore * 0.35 + timingScore * 0.2 + stabilityScore * 0.15)

  const hadLow = nadirBg != null && nadirBg < TARGET_LOW
  const outcomeTooHigh = (peakBg ?? 0) > 220 || (tir4hPct ?? 1) < 0.6
  const outcomeTooLow = hadLow

  const outcome_rating: OutcomeScores['outcome_rating'] =
    hadLow && (nadirBg ?? 999) < 60 ? 'low_alarm'
    : outcomeTooLow ? 'too_low'
    : outcomeTooHigh ? 'too_high'
    : 'good'

  const notes = [
    peakBg != null ? `Peak ${peakBg} mg/dL at ${peakAtMinutes} min.` : null,
    tir4hPct != null ? `TIR: ${Math.round(tir4hPct * 100)}% over 4h.` : null,
    hadLow ? `Nadir ${nadirBg} mg/dL at ${nadirAtMinutes} min — low occurred.` : null,
    `Stability SD: ${Math.round(sd)} mg/dL.`,
  ].filter(Boolean).join(' ')

  return {
    bg_at_1h: bg1h, bg_at_2h: bg2h, bg_at_3h: bg3h, bg_at_4h: bg4h,
    peak_bg: peakBg, peak_at_minutes: peakAtMinutes,
    nadir_bg: nadirBg, nadir_at_minutes: nadirAtMinutes,
    tir_4h_pct: tir4hPct,
    score_glucose_response: letterGrade(peakScore),
    score_tir: letterGrade(tirScore),
    score_bolus_timing: letterGrade(timingScore),
    score_stability: letterGrade(stabilityScore),
    score_overall: letterGrade(overallScore),
    score_notes: notes,
    outcome_rating,
  }
}
