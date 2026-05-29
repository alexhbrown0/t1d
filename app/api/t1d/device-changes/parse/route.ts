import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const { image_base64, media_type = 'image/jpeg', device_type } = await req.json() as {
    image_base64: string
    media_type?: 'image/jpeg' | 'image/png' | 'image/webp'
    device_type: 'cgm' | 'pod'
  }

  if (!image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 })

  const prompt = device_type === 'cgm'
    ? DEXCOM_PROMPT
    : OMNIPOD_PROMPT

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
  }
}

const DEXCOM_PROMPT = `This is a photo of a Dexcom G7 CGM sensor package or applicator label.

Dexcom tech support requires the SERIAL NUMBER when processing a replacement claim.
The serial number on a G7 is 12 digits printed after "21" on the sensor applicator or box.
It may appear as "SN: 21XXXXXXXXXXXX" or just the number sequence.

Extract exactly:
- serial_number: the full serial number as printed (include the "21" prefix if present)
- lot_number: the lot number on the packaging (may appear as "LOT" or "L" followed by numbers/letters)
- model: "Dexcom G7"
- expiration_date: the "use by" or "EXP" date from the packaging

Return ONLY valid JSON:
{
  "model": "Dexcom G7",
  "serial_number": "...",
  "lot_number": "...",
  "expiration_date": "...",
  "notes": "any other text that may be useful for a warranty claim"
}

Use null for any field you cannot find. Never guess or fabricate values.`

const OMNIPOD_PROMPT = `This is a photo of an Omnipod 5 pod package, pod tray, or pod label.

Insulet requires the following for a replacement claim:
1. LOT NUMBER — printed on the pod tray, pod bottom, or outer box. This is the most critical field.
2. SEQUENCE NUMBER — a separate number from the lot, sometimes on the pod tray or individual pod.

Extract exactly:
- lot_number: the lot number (may appear as "LOT" or "L" followed by alphanumeric characters)
- sequence_number: sequence number if visible (may be labeled "SEQ", "SN", or similar)
- model: "Omnipod 5"
- expiration_date: the expiry date from the packaging (often "EXP" or "Use by")

Return ONLY valid JSON:
{
  "model": "Omnipod 5",
  "serial_number": null,
  "lot_number": "...",
  "sequence_number": "...",
  "expiration_date": "...",
  "notes": "any other text that may be useful for a warranty claim"
}

Use null for any field you cannot find. Never guess or fabricate values.`
