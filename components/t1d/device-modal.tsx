'use client'

import { useRef, useState } from 'react'

interface DeviceRecord {
  id: string
  type: 'cgm' | 'pod'
  inserted_at: string | null
  expires_at: string | null
  grace_expires_at: string | null
  serial_number: string | null
  lot_number: string | null
  model: string | null
  removed_at: string | null
  removal_reason: string | null
  failure_notes: string | null
  claim_submitted: boolean
}

interface Props {
  device: DeviceRecord | null
  type: 'cgm' | 'pod'
  onClose: () => void
  onDeviceInserted: (d: DeviceRecord) => void
  onDeviceRemoved: (id: string) => void
}

type RemoveReason = 'replaced' | 'failed_early'
type ModalStep = 'menu' | 'removing' | 'inserting_capture' | 'inserting_parsing' | 'inserting_confirm'

interface ParsedDevice {
  model: string | null
  serial_number: string | null
  lot_number: string | null
  expiration_date: string | null
  notes: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DeviceModal({ device, type, onClose, onDeviceInserted, onDeviceRemoved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ModalStep>('menu')
  const [removeReason, setRemoveReason] = useState<RemoveReason>('replaced')
  const [failureNotes, setFailureNotes] = useState('')
  const [claimNow, setClaimNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsed, setParsed] = useState<ParsedDevice | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const deviceLabel = type === 'cgm' ? 'Dexcom G7' : 'Omnipod 5'

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('inserting_parsing')
    setParseError(null)

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'

      const res = await fetch('/api/t1d/device-changes/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: mediaType, device_type: type }),
      })
      if (res.ok) {
        const data = await res.json()
        setParsed(data)
        setStep('inserting_confirm')
      } else {
        setParseError('Could not read the label. Fill in manually.')
        setParsed({ model: deviceLabel, serial_number: null, lot_number: null, expiration_date: null, notes: null })
        setStep('inserting_confirm')
      }
    }
    reader.readAsDataURL(file)
  }

  async function confirmInsert() {
    if (!parsed) return
    setSaving(true)
    const res = await fetch('/api/t1d/device-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        inserted_at: new Date().toISOString(),
        serial_number: parsed.serial_number,
        lot_number: parsed.lot_number,
        model: parsed.model ?? deviceLabel,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      onDeviceInserted(data)
      onClose()
    }
    setSaving(false)
  }

  async function confirmRemove() {
    if (!device) return
    setSaving(true)
    const res = await fetch(`/api/t1d/device-changes/${device.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        removed_at: new Date().toISOString(),
        removal_reason: removeReason,
        failure_notes: removeReason === 'failed_early' ? failureNotes : null,
        claim_submitted: claimNow,
      }),
    })
    if (res.ok) {
      onDeviceRemoved(device.id)
      onClose()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-[#111] rounded-t-3xl border-t border-white/10 px-5 pt-5 pb-8 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-1 mb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* MENU: choose action */}
        {step === 'menu' && (
          <>
            <div>
              <p className="text-lg font-semibold text-white">{deviceLabel}</p>
              {device ? (
                <p className="text-xs text-gray-500 mt-0.5">
                  Inserted {fmtDate(device.inserted_at)} · expires {fmtDate(device.expires_at)}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">No active device recorded</p>
              )}
            </div>

            {device && (
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 px-4 py-3 space-y-1.5 text-xs">
                <Row label="Model" value={device.model ?? deviceLabel} />
                <Row label="SN" value={device.serial_number ?? '—'} />
                <Row label="Lot" value={device.lot_number ?? '—'} />
                <Row label="Inserted" value={fmtDate(device.inserted_at)} />
                <Row label="Expires" value={fmtDate(device.expires_at)} />
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                onClick={() => setStep('inserting_capture')}
                className="w-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-semibold text-sm py-3 rounded-2xl"
              >
                Insert new {deviceLabel}
              </button>
              {device && (
                <button
                  onClick={() => setStep('removing')}
                  className="w-full bg-white/5 border border-white/10 text-gray-300 font-semibold text-sm py-3 rounded-2xl"
                >
                  Remove / end {deviceLabel}
                </button>
              )}
            </div>
          </>
        )}

        {/* REMOVE FLOW */}
        {step === 'removing' && device && (
          <>
            <div>
              <p className="text-lg font-semibold text-white">Remove {deviceLabel}</p>
              <p className="text-xs text-gray-500 mt-1">
                What's the story? If it failed early, the SN and lot are saved so you can claim a replacement.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setRemoveReason('replaced')}
                className={`flex-1 rounded-2xl border p-3 text-left transition-colors ${
                  removeReason === 'replaced'
                    ? 'bg-[#1f2e2b] border-teal-500/40'
                    : 'bg-[#1a1a1a] border-white/10'
                }`}
              >
                <p className={`text-sm font-semibold ${removeReason === 'replaced' ? 'text-teal-300' : 'text-white'}`}>
                  Replaced
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">normal end of wear</p>
              </button>
              <button
                onClick={() => setRemoveReason('failed_early')}
                className={`flex-1 rounded-2xl border p-3 text-left transition-colors ${
                  removeReason === 'failed_early'
                    ? 'bg-[#2e1f1f] border-red-500/40'
                    : 'bg-[#1a1a1a] border-white/10'
                }`}
              >
                <p className={`text-sm font-semibold ${removeReason === 'failed_early' ? 'text-red-300' : 'text-white'}`}>
                  Failed early
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">died before expiry</p>
              </button>
            </div>

            {removeReason === 'failed_early' && (
              <>
                <div className="space-y-1.5">
                  <p className="text-[10px] tracking-widest text-gray-500 font-semibold">WHAT HAPPENED</p>
                  <textarea
                    value={failureNotes}
                    onChange={e => setFailureNotes(e.target.value)}
                    placeholder={`${deviceLabel} alarmed after 30 hours. BG ran high. Site looked fine…`}
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-red-500/30"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] tracking-widest text-gray-500 font-semibold">FOR THE CLAIM</p>
                  <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 px-4 py-3 space-y-1.5 text-xs">
                    <Row label="Model" value={device.model ?? deviceLabel} />
                    <Row label="SN" value={device.serial_number ?? '—'} />
                    <Row label="Lot" value={device.lot_number ?? '—'} />
                    <Row label="Applied" value={fmtDate(device.inserted_at)} />
                    <Row label="Failed" value="now" highlight />
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={claimNow}
                    onChange={e => setClaimNow(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-red-400"
                  />
                  <div>
                    <p className="text-xs text-white font-medium">Submit claim to {type === 'cgm' ? 'Dexcom' : 'Insulet'} now</p>
                    <p className="text-[10px] text-gray-500">Or leave unchecked and submit later from Device history.</p>
                  </div>
                </label>
              </>
            )}

            <button
              onClick={confirmRemove}
              disabled={saving}
              className={`w-full font-semibold text-sm py-4 rounded-2xl disabled:opacity-40 ${
                removeReason === 'failed_early'
                  ? 'bg-red-500/20 border border-red-500/30 text-red-300'
                  : 'bg-teal-500/15 border border-teal-500/30 text-teal-300'
              }`}
            >
              {saving ? 'Saving…' : removeReason === 'failed_early'
                ? 'Mark failed · keep info for later'
                : `End ${type === 'cgm' ? 'CGM' : 'Pod'}`}
            </button>
          </>
        )}

        {/* INSERT: capture */}
        {step === 'inserting_capture' && (
          <>
            <div>
              <p className="text-lg font-semibold text-white">Insert new {deviceLabel}</p>
              <p className="text-xs text-gray-500 mt-1">
                Take a photo of the packaging label to capture the SN, lot, and expiry automatically.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoSelected}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-semibold text-sm py-4 rounded-2xl"
            >
              Take photo of label
            </button>
            <button
              onClick={() => {
                setParsed({ model: deviceLabel, serial_number: null, lot_number: null, expiration_date: null, notes: null })
                setStep('inserting_confirm')
              }}
              className="w-full text-gray-500 text-sm py-2"
            >
              Skip — enter manually
            </button>
          </>
        )}

        {/* INSERT: parsing */}
        {step === 'inserting_parsing' && (
          <div className="py-8 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400">Reading label…</p>
          </div>
        )}

        {/* INSERT: confirm parsed info */}
        {step === 'inserting_confirm' && parsed && (
          <>
            <div>
              <p className="text-lg font-semibold text-white">Confirm device info</p>
              {parseError && (
                <p className="text-xs text-yellow-500 mt-1">{parseError}</p>
              )}
            </div>

            <div className="space-y-2">
              <EditRow label="Model" value={parsed.model} onChange={v => setParsed(p => p ? { ...p, model: v } : p)} />
              <EditRow label="SN" value={parsed.serial_number} onChange={v => setParsed(p => p ? { ...p, serial_number: v } : p)} placeholder="DM72-XXXXXXXX-XXXX" />
              <EditRow label="Lot" value={parsed.lot_number} onChange={v => setParsed(p => p ? { ...p, lot_number: v } : p)} placeholder="LOT-XXXXX" />
              <EditRow label="Exp. date" value={parsed.expiration_date} onChange={v => setParsed(p => p ? { ...p, expiration_date: v } : p)} placeholder="from packaging" />
            </div>

            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="device label" className="w-full rounded-xl object-cover max-h-36" />
            )}

            <button
              onClick={confirmInsert}
              disabled={saving}
              className="w-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-semibold text-sm py-4 rounded-2xl disabled:opacity-40"
            >
              {saving ? 'Saving…' : `Start ${deviceLabel}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={highlight ? 'text-red-400' : 'text-gray-300'}>{value}</span>
    </div>
  )
}

function EditRow({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] tracking-widest text-gray-500 font-semibold w-16 flex-shrink-0">{label.toUpperCase()}</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        placeholder={placeholder ?? ''}
        className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-teal-500/30"
      />
    </div>
  )
}
