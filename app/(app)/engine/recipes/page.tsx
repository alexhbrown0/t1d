'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Recipe {
  id: string
  name: string
  description: string | null
  yield_count: number | null
  yield_unit: string | null
  carbs_per_piece: number | null
  fat_per_piece: number | null
  protein_per_piece: number | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
  protein_per_100g: number | null
  typical_serving_g: number | null
  typical_serving_description: string | null
  gi_category: 'low' | 'medium' | 'high' | null
  notes: string | null
  active: boolean
}

type Mode = 'piece' | 'weight'

const GI_COLORS: Record<string, string> = {
  high: 'text-orange-400 bg-orange-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low: 'text-green-400 bg-green-500/10',
}

const BLANK: Omit<Recipe, 'id' | 'active'> = {
  name: '', description: null, yield_count: null, yield_unit: 'pieces',
  carbs_per_piece: null, fat_per_piece: null, protein_per_piece: null,
  carbs_per_100g: null, fat_per_100g: null, protein_per_100g: null,
  typical_serving_g: null, typical_serving_description: null,
  gi_category: null, notes: null,
}

function RecipeCard({ recipe, onSave, onDelete }: {
  recipe: Recipe
  onSave: (r: Recipe) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(recipe)
  const [mode, setMode] = useState<Mode>(recipe.carbs_per_piece != null ? 'piece' : 'weight')
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof draft, v: string | number | null) =>
    setDraft(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/t1d/recipes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (res.ok) { onSave(await res.json()); setOpen(false) }
    setSaving(false)
  }

  const del = async () => {
    await fetch('/api/t1d/recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recipe.id }),
    })
    onDelete(recipe.id)
  }

  const carbSummary = recipe.carbs_per_piece != null
    ? `${recipe.carbs_per_piece}g carbs / ${recipe.yield_unit?.replace(/s$/, '') ?? 'piece'}${recipe.yield_count ? ` · makes ${recipe.yield_count}` : ''}`
    : recipe.carbs_per_100g != null
    ? `${recipe.carbs_per_100g}g carbs / 100g${recipe.typical_serving_description ? ` · ${recipe.typical_serving_description}` : ''}`
    : 'No carb data'

  if (!open) {
    return (
      <div className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{recipe.name}</p>
            {recipe.gi_category && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-semibold ${GI_COLORS[recipe.gi_category]}`}>
                {recipe.gi_category} GI
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">{carbSummary}</p>
          {recipe.notes && <p className="text-[10px] text-gray-600 mt-0.5 italic">{recipe.notes}</p>}
        </div>
        <button onClick={() => setOpen(true)} className="text-gray-600 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="bg-[#141414] rounded-xl border border-teal-500/20 p-4 space-y-3">
      <input value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Recipe name"
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />

      {/* Mode picker */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1">
        {(['piece', 'weight'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-colors ${mode === m ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
            {m === 'piece' ? 'By piece (muffins, cookies…)' : 'By weight (grams)'}
          </button>
        ))}
      </div>

      {mode === 'piece' ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 flex-shrink-0">Makes</span>
            <input type="number" value={draft.yield_count ?? ''} onChange={e => set('yield_count', parseFloat(e.target.value) || null)}
              placeholder="12" className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            <input value={draft.yield_unit ?? ''} onChange={e => set('yield_unit', e.target.value)}
              placeholder="muffins" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Carbs / piece (g)</label>
              <input type="number" value={draft.carbs_per_piece ?? ''} onChange={e => set('carbs_per_piece', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Fat / piece (g)</label>
              <input type="number" value={draft.fat_per_piece ?? ''} onChange={e => set('fat_per_piece', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Protein / piece (g)</label>
              <input type="number" value={draft.protein_per_piece ?? ''} onChange={e => set('protein_per_piece', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Carbs / 100g</label>
              <input type="number" value={draft.carbs_per_100g ?? ''} onChange={e => set('carbs_per_100g', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Fat / 100g</label>
              <input type="number" value={draft.fat_per_100g ?? ''} onChange={e => set('fat_per_100g', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-600">Protein / 100g</label>
              <input type="number" value={draft.protein_per_100g ?? ''} onChange={e => set('protein_per_100g', parseFloat(e.target.value) || null)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 flex-shrink-0">Typical serving:</span>
            <input type="number" value={draft.typical_serving_g ?? ''} onChange={e => set('typical_serving_g', parseFloat(e.target.value) || null)}
              placeholder="150" className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
            <span className="text-xs text-gray-600">g =</span>
            <input value={draft.typical_serving_description ?? ''} onChange={e => set('typical_serving_description', e.target.value)}
              placeholder="1 large slice" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
        </div>
      )}

      {/* GI + notes */}
      <div className="flex gap-2">
        {(['low', 'medium', 'high'] as const).map(g => (
          <button key={g} onClick={() => set('gi_category', draft.gi_category === g ? null : g)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold capitalize border transition-colors ${
              draft.gi_category === g ? GI_COLORS[g] + ' border-current/30' : 'border-white/10 text-gray-600'
            }`}>
            {g} GI
          </button>
        ))}
      </div>

      <input value={draft.notes ?? ''} onChange={e => set('notes', e.target.value || null)}
        placeholder="Notes — e.g. always causes delayed spike, high fat"
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none" />

      <div className="flex gap-2">
        <button onClick={del} className="text-gray-600 text-xs px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 hover:text-red-400 transition-colors">Delete</button>
        <button onClick={() => setOpen(false)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold py-2 rounded-lg">Cancel</button>
        <button onClick={save} disabled={saving || !draft.name}
          className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold py-2 rounded-lg disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function RecipesPage() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newDraft, setNewDraft] = useState({ ...BLANK })
  const [newMode, setNewMode] = useState<Mode>('piece')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importPhotoRef = useRef<HTMLInputElement>(null)

  const handleImport = async (source: 'url' | 'photo', file?: File) => {
    setImportLoading(true)
    setImportError(null)
    try {
      let res: Response
      if (source === 'photo' && file) {
        const form = new FormData()
        form.append('photo', file)
        res = await fetch('/api/t1d/recipes/extract', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/t1d/recipes/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl.trim() }),
        })
      }
      if (!res.ok) throw new Error('Extraction failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setNewDraft({
        name: data.name ?? '',
        description: null,
        yield_count: data.yield_count ?? null,
        yield_unit: data.yield_unit ?? 'pieces',
        carbs_per_piece: data.carbs_per_piece ?? null,
        fat_per_piece: data.fat_per_piece ?? null,
        protein_per_piece: data.protein_per_piece ?? null,
        carbs_per_100g: data.carbs_per_100g ?? null,
        fat_per_100g: data.fat_per_100g ?? null,
        protein_per_100g: data.protein_per_100g ?? null,
        typical_serving_g: data.typical_serving_g ?? null,
        typical_serving_description: data.typical_serving_description ?? null,
        gi_category: data.gi_category ?? null,
        notes: data.notes ?? null,
      })
      setNewMode(data.carbs_per_piece != null ? 'piece' : 'weight')
      setImporting(false)
      setAdding(true)
    } catch (e) {
      setImportError('Could not extract recipe — try the other method or add manually.')
    } finally {
      setImportLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/t1d/recipes').then(r => r.json()).then(d => { setRecipes(d ?? []); setLoading(false) })
  }, [])

  const setNew = (k: keyof typeof BLANK, v: string | number | null) =>
    setNewDraft(p => ({ ...p, [k]: v }))

  const saveNew = async () => {
    if (!newDraft.name) return
    setSaving(true)
    const res = await fetch('/api/t1d/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDraft),
    })
    if (res.ok) {
      const r = await res.json()
      setRecipes(prev => [r, ...prev])
      setNewDraft({ ...BLANK })
      setAdding(false)
    }
    setSaving(false)
  }

  const filtered = recipes.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/engine/foods" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex-1">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">ENGINE</p>
          <p className="text-lg font-semibold text-white">Saved Recipes</p>
        </div>
        {(adding || importing) ? (
          <button onClick={() => { setAdding(false); setImporting(false); setImportError(null) }}
            className="text-xs text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
            Cancel
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setImporting(true); setImportUrl('') }}
              className="text-xs text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              Import
            </button>
            <button onClick={() => { setNewDraft({ ...BLANK }); setAdding(true) }}
              className="text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full">
              + Add
            </button>
          </div>
        )}
      </div>

      {/* Import recipe */}
      {importing && (
        <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">IMPORT RECIPE</p>

          <div className="space-y-2">
            <input
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="Paste recipe URL…"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
            />
            <button
              onClick={() => handleImport('url')}
              disabled={!importUrl.trim() || importLoading}
              className="w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40"
            >
              {importLoading ? 'Extracting…' : 'Extract from URL'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[10px] text-gray-600">or</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          <button
            onClick={() => importPhotoRef.current?.click()}
            disabled={importLoading}
            className="w-full border border-dashed border-teal-500/20 rounded-xl py-3 text-xs text-teal-400 font-semibold disabled:opacity-40"
          >
            {importLoading ? 'Analyzing…' : 'Upload recipe photo or screenshot'}
          </button>
          <input
            ref={importPhotoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImport('photo', file)
            }}
          />

          {importError && <p className="text-xs text-red-400">{importError}</p>}
        </div>
      )}

      {/* Add new recipe */}
      {adding && (
        <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">NEW RECIPE</p>

          <input value={newDraft.name} onChange={e => setNew('name', e.target.value)} placeholder="Recipe name"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />

          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {(['piece', 'weight'] as Mode[]).map(m => (
              <button key={m} onClick={() => setNewMode(m)}
                className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-colors ${newMode === m ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
                {m === 'piece' ? 'By piece' : 'By weight (g)'}
              </button>
            ))}
          </div>

          {newMode === 'piece' ? (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 flex-shrink-0">Makes</span>
                <input type="number" value={newDraft.yield_count ?? ''} onChange={e => setNew('yield_count', parseFloat(e.target.value) || null)}
                  placeholder="12" className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                <input value={newDraft.yield_unit ?? ''} onChange={e => setNew('yield_unit', e.target.value)}
                  placeholder="muffins" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-600">Carbs / piece</label>
                  <input type="number" value={newDraft.carbs_per_piece ?? ''} onChange={e => setNew('carbs_per_piece', parseFloat(e.target.value) || null)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-600">Fat / piece</label>
                  <input type="number" value={newDraft.fat_per_piece ?? ''} onChange={e => setNew('fat_per_piece', parseFloat(e.target.value) || null)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-600">Protein / piece</label>
                  <input type="number" value={newDraft.protein_per_piece ?? ''} onChange={e => setNew('protein_per_piece', parseFloat(e.target.value) || null)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-600">Carbs / 100g</label>
                  <input type="number" value={newDraft.carbs_per_100g ?? ''} onChange={e => setNew('carbs_per_100g', parseFloat(e.target.value) || null)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-600">Fat / 100g</label>
                  <input type="number" value={newDraft.fat_per_100g ?? ''} onChange={e => setNew('fat_per_100g', parseFloat(e.target.value) || null)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none mt-1" />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <input type="number" value={newDraft.typical_serving_g ?? ''} onChange={e => setNew('typical_serving_g', parseFloat(e.target.value) || null)}
                  placeholder="150g" className="w-24 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                <span className="text-xs text-gray-600">=</span>
                <input value={newDraft.typical_serving_description ?? ''} onChange={e => setNew('typical_serving_description', e.target.value)}
                  placeholder="1 large slice" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map(g => (
              <button key={g} onClick={() => setNew('gi_category', newDraft.gi_category === g ? null : g)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold capitalize border transition-colors ${
                  newDraft.gi_category === g ? GI_COLORS[g] + ' border-current/30' : 'border-white/10 text-gray-600'
                }`}>
                {g} GI
              </button>
            ))}
          </div>

          <input value={newDraft.notes ?? ''} onChange={e => setNew('notes', e.target.value || null)}
            placeholder="Dosing notes — e.g. high fat, watch for delayed rise"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none" />

          <button onClick={saveNew} disabled={saving || !newDraft.name}
            className="w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Recipe'}
          </button>
        </div>
      )}

      {/* Search */}
      {recipes.length > 3 && (
        <input type="text" placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center">
          <p className="text-gray-500 text-sm">{search ? 'No recipes match' : 'No recipes yet'}</p>
          <p className="text-gray-700 text-xs mt-1">Tap + Add to save your first recipe</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <RecipeCard key={r.id} recipe={r}
              onSave={updated => setRecipes(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDelete={id => setRecipes(prev => prev.filter(x => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
