import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getCentralTime, getCentralDayStartUTC, getCentralDateStr, getCentralTimeDisplay } from '@/lib/utils/central-time'
import { claude } from '@/lib/claude/client'
import { getLatestEgvs } from '@/lib/dexcom/client'

const SAVE_INTENT = /(save|log|add|write|capture|record|remember|keep).{0,60}(notes?|clinical|protocol|rules?|guidelines?|learnings?|engine)/i
const RECIPE_SAVE_INTENT = /(save|add|store|keep).{0,40}(recipe|this recipe|as a recipe|to recipes)/i
const LUNCH_PLAN_INTENT = /(plan|planning|pack|packing).{0,20}lunch/i
const LUNCH_SAVE_INTENT = /(save|finalize|done|that'?s? (it|everything|all)|nothing else).{0,40}(lunch|that)/i

// Detect when Claude's response contains a dosing or treatment recommendation
const LOG_INTENT = /\b(enter|give|treat|administer|pre-bolus)\b.{0,80}\b(grams?|juice|gummy|gummies|glucose|tabs?|fast carbs?|pump|correction)\b/i

function rateOfChange(egvs: { system_time: string; value_mgdl: unknown }[]): number | null {
  const pts = egvs
    .filter(e => e.value_mgdl != null)
    .slice(0, 5)
    .map(e => ({ t: new Date(e.system_time).getTime(), bg: Number(e.value_mgdl) }))
    .reverse()
  if (pts.length < 2) return null
  const spanMin = (pts[pts.length - 1].t - pts[0].t) / 60000
  if (spanMin === 0) return null
  return (pts[pts.length - 1].bg - pts[0].bg) / spanMin
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_chat_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { message, photo_base64, photo_mime_type, photos: photosArr } = await req.json()
  // Normalize to array — supports both legacy single-photo and new multi-photo payload
  const allPhotos: { base64: string; mime_type: string }[] = photosArr
    ? photosArr
    : photo_base64
      ? [{ base64: photo_base64, mime_type: photo_mime_type || 'image/jpeg' }]
      : []
  const supabase = createServerClient()
  const ct = getCentralTime()
  const dayOfWeek = ct.dayOfWeek
  const midnightIso = getCentralDayStartUTC().toISOString()
  // For IOB decay only (Glooko ~24h delay means recent app doses more relevant)
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString()

  const [egvs, bolusResult, lowResult, appDoseResult, mealResult, overrideResult, scheduleResult, paramsResult, recipesResult, foodRepoResult] = await Promise.all([
    // 24 readings = ~2 hours of BG history for proper trend analysis
    getLatestEgvs(24),
    // All of today's pump boluses (Glooko, ~24h delay)
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, bg_input_mgdl').gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(20),
    // All of today's logged lows
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g, notes').gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(10),
    // All of today's app dose sessions (more current than Glooko)
    supabase.from('t1d_dose_sessions').select('timestamp, recommended_dose_grams, actual_dose_grams, actual_dose_timestamp, pump_suggested_units, engine_reasoning, context_snapshot').gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(10),
    // Today's meal events (lunch + snack)
    supabase.from('t1d_meal_events').select('timestamp, context, items_offered, items_eaten, total_offered_carbs, total_eaten_carbs, fpu_count').in('context', ['school_lunch', 'snack']).gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(3),
    // Today's schedule overrides
    supabase.from('t1d_daily_overrides').select('pe_cancelled, pe_start_time, lunch_start_time, notes').eq('override_date', getCentralDateStr()).limit(1),
    // Full day's schedule
    supabase.from('t1d_school_schedule').select('event_type, start_time, end_time, day_of_week').eq('active', true).eq('day_of_week', dayOfWeek).order('start_time'),
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1),
    supabase.from('t1d_recipes').select('name, yield_count, yield_unit, carbs_per_piece, carbs_per_100g, typical_serving_g, typical_serving_description, gi_category, notes').eq('active', true),
    supabase.from('t1d_food_repo').select('name, aliases, serving_size, serving_qty, carbs_g, fat_g, protein_g, category, notes').eq('active', true).order('name'),
  ])

  const params = paramsResult.data?.[0]
  const boluses = bolusResult.data ?? []
  const lows = lowResult.data ?? []
  const appDoses = (appDoseResult.data ?? []) as Array<{
    timestamp: string; recommended_dose_grams: number | null; actual_dose_grams: number | null
    actual_dose_timestamp: string | null; pump_suggested_units: number | null
    engine_reasoning: string | null; context_snapshot: Record<string, unknown> | null
  }>
  const todayMeals = mealResult.data ?? []
  const todayMeal = todayMeals.find((m: { context: string }) => m.context === 'school_lunch') ?? null
  const todaySnack = todayMeals.find((m: { context: string }) => m.context === 'snack') ?? null
  const todayOverride = overrideResult.data?.[0] ?? null
  const schedule = scheduleResult.data ?? []
  const foodRepo = foodRepoResult.data ?? []
  const recipes = recipesResult.data ?? []

  // First meal of day = no Glooko boluses AND no confirmed app doses today
  const isFirstMealOfDay = boluses.length === 0 && appDoses.every(d => d.actual_dose_grams == null)

  const latest = egvs[0]
  const minsAgo = latest ? Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000) : null
  const bgFresh = minsAgo != null && minsAgo <= 15
  const bg = bgFresh && latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const rate = bgFresh ? rateOfChange(egvs) : null
  // Show up to 2h of readings with timestamps for proper context
  const bgHistory = egvs.slice(0, 24).reverse().map(e =>
    `${new Date(e.system_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })} ${Math.round(Number(e.value_mgdl))}`
  ).join(', ')
  const rateStr = rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)} mg/dL/min` : 'unknown'

  const dia = (params?.current_dia ?? 2) * 3600000
  // IOB from Glooko (limited to 6h for decay relevance)
  const iobGlooko = boluses.filter(b => Date.now() - new Date(b.timestamp).getTime() < dia).reduce((sum, b) => {
    const elapsed = Date.now() - new Date(b.timestamp).getTime()
    return sum + Number(b.insulin_delivered_u ?? 0) * Math.max(0, 1 - elapsed / dia)
  }, 0)
  // IOB from confirmed app doses with known units
  const iobApp = appDoses.filter(d => d.actual_dose_grams != null && d.pump_suggested_units != null).reduce((sum, d) => {
    const ts = d.actual_dose_timestamp ?? d.timestamp
    const elapsed = Date.now() - new Date(ts).getTime()
    return elapsed < dia ? sum + Number(d.pump_suggested_units) * Math.max(0, 1 - elapsed / dia) : sum
  }, 0)
  const iob = Math.max(iobGlooko, iobApp)

  const nowMins = ct.minutesSinceMidnight
  const scheduleLines = schedule.map(s => {
    const [h, m] = s.start_time.split(':').map(Number)
    const minsUntil = (h * 60 + m) - nowMins
    const rel = minsUntil > 0 ? `in ${minsUntil}min` : `${Math.abs(minsUntil)}min ago`
    return `${s.event_type} ${s.start_time}–${s.end_time} (${rel})`
  }).join(', ')

  const mealPeriod = ct.hour < 10 ? 'breakfast' : ct.hour < 14 ? 'lunch' : ct.hour < 17 ? 'afternoon' : 'dinner/evening'

  const contextBlock = [
    `Time: ${getCentralTimeDisplay()}, ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]} — meal period: ${mealPeriod}${isFirstMealOfDay ? ' — FIRST MEAL OF DAY (fasting state, stomach empty, fast Fiasp absorption, full pre-bolus timing applies)' : ' — fed state (not first meal, stomach not empty, absorption slower than fasting)'}`,
    bg != null
      ? `BG last 2h (with timestamps): ${bgHistory} | now ${bg} mg/dL, ${minsAgo}min ago, rate: ${rateStr}`
      : `BG: no live reading (last reading ${minsAgo != null ? `${minsAgo}min ago — too stale` : 'unavailable'})`,
    boluses.length > 0
      ? `Pump boluses today (Glooko, ~24h delay):\n${boluses.map(b => `  ${fmtTime(b.timestamp)} — ${b.insulin_delivered_u}U / ${b.carbs_input_g ?? 0}g carbs${b.bg_input_mgdl ? ` (BG ${b.bg_input_mgdl} at dose)` : ''}`).join('\n')}`
      : 'No pump boluses logged today in Glooko (24h delay — check app doses)',
    appDoses.length > 0
      ? `App-logged doses today:\n${appDoses.map(d => {
          const isFollowup = d.context_snapshot?.is_followup
          const tag = isFollowup ? '[follow-up] ' : ''
          const status = d.actual_dose_grams != null
            ? `confirmed ${d.actual_dose_grams}g${d.pump_suggested_units != null ? ` (${d.pump_suggested_units}u)` : ''}`
            : `${d.recommended_dose_grams}g recommended — NOT YET CONFIRMED`
          return `  ${fmtTime(d.timestamp)} ${tag}${status}`
        }).join('\n')}`
      : 'No app-logged doses today',
    `IOB estimate: ~${iob.toFixed(2)}U (DIA ${params?.current_dia ?? 2}h)`,
    lows.length > 0
      ? `Low treatments today:\n${lows.map(l => `  ${fmtTime(l.timestamp)} — BG ${l.bg_at_treatment ?? '?'} → ${l.treatment_type ?? 'treated'} ${l.treatment_carbs_g ?? '?'}g${l.notes ? ` (${l.notes})` : ''}`).join('\n')}`
      : 'No lows logged today',
    todayMeal
      ? todayMeal.items_eaten
        ? `School lunch: ${todayMeal.total_offered_carbs ?? '?'}g packed, ${todayMeal.total_eaten_carbs ?? '?'}g eaten${(todayMeal.fpu_count ?? 0) > 1.5 ? ` — HIGH fat/protein (${todayMeal.fpu_count?.toFixed(1)} FPU)` : ''}`
        : `School lunch packed (${todayMeal.total_offered_carbs ?? '?'}g) — not eaten yet`
      : 'No school lunch packed today',
    todaySnack
      ? todaySnack.items_eaten
        ? `Afternoon snack: ${todaySnack.total_offered_carbs ?? '?'}g packed, ${todaySnack.total_eaten_carbs ?? '?'}g eaten`
        : `Afternoon snack packed (${todaySnack.total_offered_carbs ?? '?'}g) — not eaten yet`
      : null,
    todayOverride?.pe_cancelled ? 'TODAY: PE CANCELLED — no activity reduction' :
    todayOverride?.pe_start_time ? `TODAY: PE moved to ${todayOverride.pe_start_time}` :
    todayOverride?.lunch_start_time ? `TODAY: Lunch moved to ${todayOverride.lunch_start_time}` : '',
    scheduleLines ? `Full schedule today: ${scheduleLines}` : 'No schedule entries for today',
    params ? `Engine params: ICR ${params.current_icr}, ISF ${params.current_isf}, target BG ${params.target_bg}, DIA ${params.current_dia}h, pre-bolus lead ${params.pre_bolus_lead_min}min, activity cut ${Math.round((params.activity_reduction_pct ?? 0) * 100)}%` : '',
    recipes.length > 0
      ? `Saved recipes:\n${recipes.map(r => {
          const perPiece = r.carbs_per_piece != null ? `${r.carbs_per_piece}g carbs per ${r.yield_unit?.replace(/s$/, '') ?? 'piece'}` : ''
          const per100g = r.carbs_per_100g != null ? `${r.carbs_per_100g}g carbs/100g` : ''
          const anchor = r.typical_serving_g != null ? `, typical serving ~${r.typical_serving_g}g (${r.typical_serving_description ?? 'one serving'})` : ''
          const macros = [perPiece, per100g].filter(Boolean).join(', ')
          const gi = r.gi_category ? ` — ${r.gi_category} GI` : ''
          const notes = r.notes ? ` — ${r.notes}` : ''
          return `  • ${r.name}: ${macros}${anchor}${gi}${notes}`
        }).join('\n')}`
      : '',
    foodRepo.length > 0
      ? `Known foods (Brooks's usual items):\n${foodRepo.map(f => {
          const carbs = `${f.carbs_g}g carbs`
          const fat = f.fat_g != null ? `, ${f.fat_g}g fat` : ''
          const protein = f.protein_g != null ? `, ${f.protein_g}g protein` : ''
          const aliases = f.aliases?.length ? ` (also: ${f.aliases.join(', ')})` : ''
          const notes = f.notes ? ` — ${f.notes}` : ''
          return `  • ${f.name}${aliases}: ${carbs}${fat}${protein} per ${f.serving_qty > 1 ? f.serving_qty + ' ' : ''}${f.serving_size}${notes}`
        }).join('\n')}`
      : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are an AI assistant helping manage Brooks's Type 1 diabetes. Brooks is a child on Omnipod 5 with Fiasp insulin and Dexcom G7 CGM.
${params?.clinical_notes ? `\nClinical notes (follow these — these persist across all sessions and inform every recommendation):\n${params.clinical_notes}\n` : ''}
Current context:
${contextBlock}

Rules:
- Format: use a dash and a line break for each food item in a breakdown. Put a blank line between sections (breakdown, dosing recommendation, follow-up notes). No bold, no headers, no asterisks, no markdown beyond dashes for list items and blank lines for section separation.
- Response length: match the situation. A carb estimate is 5-8 lines. A dosing recommendation adds 2-3 lines. Never run them together into a paragraph.
- Carb-only vs. dosing mode: if the user asks what something is, wants to know the carbs, or is planning ahead — give the itemized breakdown and total, then stop. Do not add dosing math ("at ICR 15, enter X grams") unless they say they are eating right now, are about to dose, or explicitly ask for a recommendation. The mode is usually obvious: "what would this be?" = carb estimate only. "We're eating now" or "about to give him X" = full dosing guidance.
- Lunch planning mode: if any message in this conversation contains "plan lunch", "planning lunch", "packing lunch", or similar, ALL messages in this conversation are in lunch planning mode until the user says they're eating. In lunch planning mode: NEVER ask for current blood sugar. Not even as a follow-up. Not even as a suggestion. Build the lunch item by item. After each addition, show the running list and carb tally. When the user seems done, ask "anything else?" before wrapping up. If known foods are listed in context, suggest relevant ones. After finalizing, tell them you can save it as today's lunch plan.
- Food breakdowns: start with 1-3 sentences of reasoning — how you're estimating volume or density, what's taking up more space, any GI or absorption notes worth knowing. Then a blank line, then the itemized list: one dash per item as: - [item], ~[amount] — ~[X]g carbs. Total on its own line. Keep the reasoning — it's useful. Just always follow it with the clean line-by-line breakdown so the numbers are easy to scan.
- BG awareness: when giving dosing guidance, use the live BG from context if it is fresh. If context shows no reading or a stale one, ask for the current number before completing the dosing recommendation — but only at that point, not during a carb-estimate-only response.
- Saved recipes: if the user mentions a food that matches a saved recipe by name, always ask whether they mean the saved recipe or a different version (store-bought, restaurant, different preparation) before using the recipe's macros. Only use saved recipe numbers when the user confirms it — e.g. "the homemade ones", "from our recipe", or "yes that one". If they don't confirm, estimate using general nutrition knowledge instead.
- Dosing guidance: always say "enter X grams into the pump", never units.
- For lows: fast carbs only, no insulin.
- Flag anything uncertain or that needs Alexandra's input.
- Voice dictation: Alexandra and the school nurse often use voice-to-text. Interpret phonetic errors charitably — "bowl" likely means bolus, "fee" or "fee-asp" means Fiasp, "ain't" means ate, "people is" means pre-bolus, "correction" and "correction dose" are interchangeable.
- Fasting vs. fed state: "first meal of day" means his stomach is empty after overnight fasting — Fiasp absorbs fastest, BG rises quickly, and the full pre-bolus lead time matters most. Any meal after the first (even an hour later) is fed state — gastric emptying is slower and pre-bolus timing is less critical. The context block will tell you which state applies.
- Restaurant meals: when the user mentions a restaurant by name, use your training knowledge of that chain's menu nutrition. State clearly when using published data vs. estimating ("Outback's Honey Wheat Bushman Bread is about 78g for the whole loaf — one roll is roughly 13g" vs. "estimating from the photo"). For major chains you have solid data — use it confidently.
- Message timestamps: older messages in this conversation are prefixed with how long ago they were sent (e.g. "[45min ago]", "[2h 10min ago]"). Use these to understand what's still clinically relevant.
- Multi-course meal tracking: for messages within the last 2 hours, read back through the conversation to build a running total of all carbs estimated and doses discussed. Print it on its own line in every response once a meal is underway:
  Meal so far: [item] (~Xg) + [item] (~Xg) = ~[total]g | dosed: [Xg or "nothing yet"]
  Do not include food from messages older than 2 hours in this total — that was a separate meal. Fiasp clears in 2-3 hours so older doses don't carry forward either.
- High-fat exception: if an earlier meal (even 2-4 hours ago) was high in fat or protein — pizza, fried food, creamy sauces, burgers — note that there may still be a fat-protein glucose rise in progress. That context is worth keeping even if it falls outside the 2-hour meal window.
- Dosing across courses: factor in what was already dosed earlier in this conversation. Say "you already entered 20g for the bread — enter Yg more for the pasta" rather than recalculating from scratch.
- High-carb threshold: if the running undosed carb total is approaching or over 40g, suggest pausing, checking BG, and waiting 15-20 minutes before dosing the next course rather than stacking. At 60g+ undosed, flag it clearly.
- Memory: clinical notes ARE the persistence mechanism. When you identify a dosing rule, protocol, or observation worth keeping, propose saving it as a clinical note. Clinical notes persist to every future session and all dosing calculations. You do not need to disclaim that you lack memory — notes bridge that gap.`

  const today = getCentralDateStr()

  // Upload all photos to storage
  const photoUrls: string[] = []
  for (let i = 0; i < allPhotos.length; i++) {
    const p = allPhotos[i]
    const imgBuffer = Buffer.from(p.base64, 'base64')
    const ext = p.mime_type.split('/')[1] || 'jpg'
    const path = `${today}/${Date.now()}-${i}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('chat-photos')
      .upload(path, imgBuffer, { contentType: p.mime_type, upsert: false })
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('chat-photos').getPublicUrl(path)
      photoUrls.push(urlData.publicUrl)
    }
  }
  const photoUrl = photoUrls.length === 0 ? null
    : photoUrls.length === 1 ? photoUrls[0]
    : JSON.stringify(photoUrls)

  const storedContent = allPhotos.length > 0
    ? `[photo${allPhotos.length > 1 ? 's' : ''}] ${message || ''}`.trim()
    : message

  const { data: userMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'user',
    content: storedContent,
    photo_url: photoUrl,
  }).select().single()

  const { data: history } = await supabase
    .from('t1d_chat_log')
    .select('role, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const allHistory = (history ?? []).reverse()

  // Drop messages from before a 90-minute gap so Claude doesn't treat old sessions as current context
  let startIdx = 0
  for (let i = allHistory.length - 2; i >= 0; i--) {
    const gap = (new Date(allHistory[i + 1].created_at).getTime() - new Date(allHistory[i].created_at).getTime()) / 60000
    if (gap > 90) { startIdx = i + 1; break }
  }
  const historyMessages = allHistory.slice(startIdx).slice(-20)

  // Build message array — inject vision content for the current message if photos were attached
  // Prefix older messages with a relative timestamp so Claude can reason about what's still relevant
  function timePrefix(isoTimestamp: string, isLast: boolean): string {
    if (isLast) return ''
    const minsAgoMsg = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 60000)
    if (minsAgoMsg < 10) return ''
    if (minsAgoMsg < 60) return `[${minsAgoMsg}min ago] `
    const h = Math.floor(minsAgoMsg / 60)
    const m = minsAgoMsg % 60
    return `[${h}h${m > 0 ? ` ${m}min` : ''} ago] `
  }

  const messages = historyMessages.map((m: { role: string; content: string; created_at: string }, idx: number) => {
    const isLast = idx === historyMessages.length - 1
    if (isLast && m.role === 'user' && allPhotos.length > 0) {
      return {
        role: 'user' as const,
        content: [
          ...allPhotos.map(p => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: (p.mime_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: p.base64 },
          })),
          { type: 'text' as const, text: message || 'What food do you see? List each item with estimated carbs, then give dosing guidance.' },
        ],
      }
    }
    return {
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: timePrefix(m.created_at, isLast) + m.content,
    }
  })

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  const { data: assistantMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'assistant',
    content: reply,
  }).select().single()

  const fullConvo = [
    ...messages.slice(-8),
    { role: 'assistant' as const, content: reply },
  ].map(m => `${m.role === 'user' ? 'Alexandra' : 'Assistant'}: ${typeof m.content === 'string' ? m.content : '[photo]'}`).join('\n')

  let proposal: string | null = null
  if (SAVE_INTENT.test(message) || SAVE_INTENT.test(reply)) {
    const distillResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Distill the clinical insight or rule from this conversation into a precise, factual protocol note (2-4 sentences). Write it as a standing instruction — not a conversation summary. Plain text only, no markdown.\n\n${fullConvo}`,
      }],
    })
    proposal = distillResult.content[0].type === 'text' ? distillResult.content[0].text.trim() : null
  }

  // When Claude's response contains a recommendation, propose logging it after it's done
  let log_proposal: Record<string, unknown> | null = null
  if (LOG_INTENT.test(reply)) {
    const extractResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `From this conversation, extract the medical action being recommended. Return ONLY valid JSON, no other text.

Schema: { "type": "low_treatment" | "dose" | "unknown", "treatment_type": "juice" | "gummies" | "glucose_tabs" | "candy" | "other" | null, "treatment_carbs_g": number | null, "dose_grams": number | null, "display": "short human-readable description of what to do, e.g. juice box (15g fast carbs) or 28g pre-bolus into pump" }

Conversation:
${fullConvo}`,
      }],
    })
    try {
      const raw = extractResult.content[0].type === 'text' ? extractResult.content[0].text.trim() : ''
      const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ''))
      if (parsed.type !== 'unknown') {
        log_proposal = { ...parsed, timestamp: new Date().toISOString() }
      }
    } catch { /* ignore parse errors */ }
  }

  // Detect recipe save intent and extract structured recipe data
  let recipe_proposal: Record<string, unknown> | null = null
  if (RECIPE_SAVE_INTENT.test(message) || RECIPE_SAVE_INTENT.test(reply)) {
    const recipeResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `From this conversation, extract the recipe being described. Return ONLY valid JSON.

Schema: { "name": string, "yield_count": number | null, "yield_unit": string | null, "carbs_per_piece": number | null, "fat_per_piece": number | null, "protein_per_piece": number | null, "carbs_per_100g": number | null, "fat_per_100g": number | null, "protein_per_100g": number | null, "typical_serving_g": number | null, "typical_serving_description": string | null, "gi_category": "high" | "medium" | "low" | null, "notes": string | null, "ingredients": [{ "name": string, "qty": string }] }

Conversation:
${fullConvo}`,
      }],
    })
    try {
      const raw = recipeResult.content[0].type === 'text' ? recipeResult.content[0].text.trim() : ''
      recipe_proposal = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ''))
    } catch { /* ignore */ }
  }

  // Detect lunch plan save intent — fires when user wraps up planning mode
  const isLunchSession = LUNCH_PLAN_INTENT.test(message) || historyMessages.some(m => LUNCH_PLAN_INTENT.test(m.content))
  let lunch_plan: Record<string, unknown> | null = null
  if (isLunchSession && (LUNCH_SAVE_INTENT.test(message) || LUNCH_SAVE_INTENT.test(reply))) {
    const lunchResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `From this lunch planning conversation, extract the finalized lunch. Return ONLY valid JSON.

Schema: { "items": [{ "name": string, "qty": string, "carbs_g": number }], "total_carbs_g": number, "notes": string | null }

Conversation:
${fullConvo}`,
      }],
    })
    try {
      const raw = lunchResult.content[0].type === 'text' ? lunchResult.content[0].text.trim() : ''
      lunch_plan = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ''))
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    userMsg,
    assistantMsg,
    ...(proposal ? { proposal } : {}),
    ...(log_proposal ? { log_proposal } : {}),
    ...(recipe_proposal ? { recipe_proposal } : {}),
    ...(lunch_plan ? { lunch_plan } : {}),
  })
}
