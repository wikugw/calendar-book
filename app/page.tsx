'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useTheme } from '@/components/DarkModeProvider'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── types ───────────────────────────────────────────────────────────────────

type BookEntry = {
  id: string
  date: string
  title: string
  image_url: string | null
  summary: string | null
}

type EntryMap = Record<string, BookEntry>

type ModalState =
  | { mode: 'closed' }
  | { mode: 'view'; entry: BookEntry }
  | { mode: 'form'; date: string; entry?: BookEntry }

// ─── helpers ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

async function uploadCover(file: File, date: string): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `covers/${date}.${ext}`
  const { error } = await supabase.storage
    .from('book-covers')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('book-covers').getPublicUrl(path)
  return data.publicUrl
}

// ─── Supabase data helpers ────────────────────────────────────────────────────

async function fetchMonthEntries(year: number, month: number): Promise<BookEntry[]> {
  // month is 0-indexed here (JS convention)
  const m = month + 1 // convert to 1-indexed
  const paddedMonth = String(m).padStart(2, '0')
  const start = `${year}-${paddedMonth}-01`
  const lastDay = new Date(year, m, 0).getDate()
  const end = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('book_entries')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

async function saveEntry(entry: { date: string; title: string; image_url: string; summary: string }): Promise<BookEntry> {
  const { data, error } = await supabase
    .from('book_entries')
    .upsert(entry, { onConflict: 'date' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteEntry(date: string): Promise<void> {
  const { error } = await supabase
    .from('book_entries')
    .delete()
    .eq('date', date)
  if (error) throw new Error(error.message)
}

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors text-base"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function BookModal({
  state,
  onClose,
  onSave,
  onDelete,
}: {
  state: ModalState
  onClose: () => void
  onSave: (d: { date: string; title: string; image_url: string; summary: string }) => Promise<void>
  onDelete: (date: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.mode === 'form') {
      setTitle(state.entry?.title ?? '')
      setImageUrl(state.entry?.image_url ?? '')
      setImageFile(null)
      setImagePreview(state.entry?.image_url ?? '')
      setSummary(state.entry?.summary ?? '')
    }
  }, [state])

  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  if (state.mode === 'closed') return null

  const backdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImageUrl('')
    setImagePreview(URL.createObjectURL(file))
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(e.target.value)
    setImageFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setImagePreview(e.target.value)
  }

  const clearImage = () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImageUrl('')
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── view ──
  if (state.mode === 'view') {
    const { entry } = state
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={backdropClick}>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-100 dark:border-zinc-800">
          {entry.image_url && (
            <div className="w-full h-64 bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <img src={entry.image_url} alt={entry.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{entry.date}</p>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">{entry.title}</h2>
            {entry.summary && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{entry.summary}</p>
            )}
            <div className="flex gap-2 mt-6">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Close
              </button>
              <button
                onClick={async () => { setDeleting(true); await onDelete(entry.date); setDeleting(false); onClose() }}
                disabled={deleting}
                className="py-2 px-4 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── form ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      let finalImageUrl = imageUrl.trim()
      if (imageFile) finalImageUrl = await uploadCover(imageFile, state.date)
      await onSave({ date: state.date, title: title.trim(), image_url: finalImageUrl, summary: summary.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={backdropClick}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-zinc-100 dark:border-zinc-800">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{state.date}</p>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
            {state.entry ? 'Edit entry' : 'Add a book'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Book Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Alchemist" required className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Cover Image</label>
            {imagePreview ? (
              <div className="flex justify-center mb-1">
                <div className="relative w-32 rounded-xl overflow-hidden shadow border border-zinc-200 dark:border-zinc-700" style={{ aspectRatio: '2/3' }}>
                  <img src={imagePreview} alt="cover" className="w-full h-full object-cover" onError={() => setImagePreview('')} />
                  <button type="button" onClick={clearImage} className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full text-xs flex items-center justify-center transition-colors">✕</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex flex-col items-center gap-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <span className="text-2xl">📷</span>
                  <span className="text-xs font-medium">Upload from your device</span>
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600">JPG, PNG, WEBP</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <div className="flex items-center gap-2 text-xs text-zinc-300 dark:text-zinc-600">
                  <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <span>or paste URL</span>
                  <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <input type="url" value={imageUrl} onChange={handleUrlChange} placeholder="https://…" className={inputCls} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Reading Notes</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="What did you read or think about today?" rows={4} className={`${inputCls} resize-none`} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 dark:border-zinc-900/30 border-t-white dark:border-t-zinc-900 rounded-full animate-spin" />{imageFile ? 'Uploading…' : 'Saving…'}</>
              ) : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── CalendarDay ──────────────────────────────────────────────────────────────

function CalendarDay({ day, entry, isToday, onClick }: {
  day: number; entry?: BookEntry; isToday: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{ aspectRatio: '2/3' }}
      className={`
        group relative w-full rounded-xl overflow-hidden border transition-all duration-150
        ${entry
          ? 'border-transparent shadow-sm hover:shadow-md hover:scale-[1.03]'
          : isToday
            ? 'border-zinc-900 dark:border-zinc-300 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            : 'border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'
        }
      `}
    >
      {entry?.image_url ? (
        <>
          <img src={entry.image_url} alt={entry.title} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-150 flex items-end p-1.5">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-semibold leading-tight line-clamp-2 text-left drop-shadow">{entry.title}</span>
          </div>
          <span className="absolute top-1 left-1 text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{day}</span>
        </>
      ) : entry ? (
        <div className="absolute inset-0 bg-zinc-800 dark:bg-zinc-700 flex flex-col items-start justify-between p-2">
          <span className="text-[10px] font-bold text-zinc-400">{day}</span>
          <span className="text-[9px] font-semibold text-white leading-tight line-clamp-3 text-left">{entry.title}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className={`text-xs font-semibold ${isToday ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600'}`}>{day}</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-zinc-400 dark:text-zinc-500">+ add</span>
        </div>
      )}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [entries, setEntries] = useState<EntryMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ mode: 'closed' })

  const loadEntries = useCallback(async (y: number, m: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMonthEntries(y, m)
      const map: EntryMap = {}
      data.forEach(e => { map[e.date] = e })
      setEntries(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEntries(year, month)
  }, [year, month, loadEntries])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const handleDayClick = (dateKey: string) => {
    const entry = entries[dateKey]
    if (entry) setModal({ mode: 'view', entry })
    else setModal({ mode: 'form', date: dateKey })
  }

  const handleSave = async (data: { date: string; title: string; image_url: string; summary: string }) => {
    const saved = await saveEntry(data)
    setEntries(prev => ({ ...prev, [saved.date]: saved }))
  }

  const handleDelete = async (date: string) => {
    await deleteEntry(date)
    setEntries(prev => {
      const next = { ...prev }
      delete next[date]
      return next
    })
  }

  const totalDays = daysInMonth(year, month)
  const startDay = firstDayOfMonth(year, month)
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const totalRead = Object.keys(entries).length

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Book Calendar</h1>
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">One book per day, forever.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors">←</button>
          <div className="text-center">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{MONTHS[month]} {year}</h2>
            {totalRead > 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{totalRead} book{totalRead !== 1 ? 's' : ''} this month</p>}
          </div>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors">→</button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wide py-1">{d}</div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} style={{ aspectRatio: '2/3' }} />)}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1
              const dateKey = toDateKey(year, month, day)
              return (
                <CalendarDay
                  key={dateKey}
                  day={day}
                  entry={entries[dateKey]}
                  isToday={dateKey === todayKey}
                  onClick={() => handleDayClick(dateKey)}
                />
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-4 mt-6 text-xs text-zinc-400 dark:text-zinc-600">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-zinc-800 dark:bg-zinc-700" />
            <span>Book logged</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded border border-zinc-900 dark:border-zinc-300" />
            <span>Today</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
            <span>Empty</span>
          </div>
        </div>
      </div>

      <BookModal
        state={modal}
        onClose={() => setModal({ mode: 'closed' })}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
