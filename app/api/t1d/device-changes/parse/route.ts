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

  const deviceName = device_type === 'cgm' ? 'Dexcom G7 CGM sensor' : 'Omnipod 5 pod'

  const prompt = `This is a photo of a ${deviceName} package or label. Extract all of the following fields you can find. Return ONLY valid JSON, no explanation.

For a Dexcom G7:
- serial_number: format like DM72-XXXXXXXX-XXXX (on the sensor package)
- lot_number: lot number printed on box (e.g. "LOT-22417" or just the number)
- model: "Dexcom G7"
- expiration_date: the "use by" or expiry date on the package (ISO 8601 if possible, otherwise as written)

For an Omnipod 5:
- serial_number: if visible (not always present on individual pods)
- lot_number: lot number on the pod package
- model: "Omnipod 5"
- expiration_date: expiry date on package

Return:
{
  "model": "...",
  "serial_number": "...",
  "lot_number": "...",
  "expiration_date": "...",
  "notes": "any other relevant text visible on the label"
}

Use null for any field you cannot find. Never guess or fabricate values.`

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
