'use client'

import { useState } from 'react'

export function EngineData() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setUploading(true)
    setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/ingest/glooko', { method: 'POST', body: form })
      const data = await res.json()
      if (data.cgm_error) {
        setResult(`CGM error: ${data.cgm_error}`)
      } else {
        setResult(`Done — ${data.cgm ?? 0} CGM readings, ${data.bolus ?? 0} bolus records`)
      }
    } catch {
      setResult('Upload failed — check file format')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Glooko import */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">GLOOKO IMPORT</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Drop the Glooko zip export here. CGM readings backfill into the BG history; bolus records populate the dose log.
        </p>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            dragging ? 'border-teal-500/50 bg-teal-500/5' : 'border-white/10'
          }`}
        >
          <label className="cursor-pointer">
            <p className="text-sm text-gray-400">Drop Glooko zip here</p>
            <p className="text-xs text-gray-600 mt-1">or tap to pick file</p>
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </label>
        </div>
        {uploading && <p className="text-xs text-teal-400 text-center">Importing...</p>}
        {result && <p className="text-xs text-gray-400 text-center">{result}</p>}
      </div>

      {/* Dexcom status */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">DEXCOM SYNC</p>
        <p className="text-xs text-gray-500">CGM data syncs automatically every 5 minutes via Dexcom API.</p>
        <a
          href="/api/auth/dexcom"
          className="mt-3 flex items-center gap-2 text-xs text-teal-400"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
          Re-authorize Dexcom
        </a>
      </div>
    </div>
  )
}
