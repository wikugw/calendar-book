'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useTheme } from '@/components/DarkModeProvider'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── types ───────────────────────────────────────────────────────────────────

type Book = {
  id: string
  title: string
  image_url: string | null
  author: string | null
  completed: boolean
}

type BookEntry = {
  id: string
  date: string
  title: string
  image_url: string | null
  summary: string | null
  day_order: number
}

// date → sorted list of entries
type EntryMap = Record<string, BookEntry[]>

type ModalState =
  | { mode: 'closed' }
  | { mode: 'view'; date: string; index: number }
  | { mode: 'add'; date: string }

type Tab = 'calendar' | 'library'

// ─── helpers ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function firstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay() }

async function uploadCover(file: File, name: string): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `covers/${name}-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('book-covers')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new Error(error.message)
  return supabase.storage.from('book-covers').getPublicUrl(path).data.publicUrl
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchMonthEntries(year: number, month: number): Promise<BookEntry[]> {
  const m = month + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${year}-${pad(m)}-01`
  const end = `${year}-${pad(m)}-${String(new Date(year, m, 0).getDate()).padStart(2,'0')}`
  const { data, error } = await supabase
    .from('book_entries').select('*')
    .gte('date', start).lte('date', end)
    .order('date').order('day_order')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function addEntry(entry: {
  date: string; title: string; image_url: string; summary: string; day_order: number
}): Promise<BookEntry> {
  const { data, error } = await supabase
    .from('book_entries').insert(entry).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('book_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

async function saveBook(book: { title: string; image_url: string; author: string }): Promise<Book> {
  const { data, error } = await supabase.from('books').insert(book).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function toggleBookCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase.from('books').update({ completed }).eq('id', id)
  if (error) throw new Error(error.message)
}

async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── shared components ────────────────────────────────────────────────────────

function ImageInput({ preview, onFile, onUrl, onClear }: {
  preview: string
  onFile: (url: string, file: File) => void
  onUrl: (url: string) => void
  onClear: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition"

  if (preview) return (
    <div className="flex justify-center">
      <div className="relative w-28 rounded-xl overflow-hidden shadow border border-zinc-200 dark:border-zinc-700" style={{ aspectRatio: '2/3' }}>
        <img src={preview} alt="cover" className="w-full h-full object-cover" onError={onClear} />
        <button type="button" onClick={onClear} className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full text-xs flex items-center justify-center">✕</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => fileInputRef.current?.click()}
        className="w-full py-7 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex flex-col items-center gap-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300">
        <span className="text-xl">📷</span>
        <span className="text-xs font-medium">Upload from device</span>
        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">JPG, PNG, WEBP, AVIF</span>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(URL.createObjectURL(f), f) }}
        className="hidden" />
      <div className="flex items-center gap-2 text-xs text-zinc-300 dark:text-zinc-600">
        <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" /><span>or paste URL</span>
        <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <input type="url" placeholder="https://…" onChange={e => onUrl(e.target.value)} className={inputCls} />
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label="Toggle dark mode"
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-base">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

// ─── AddEntryModal ────────────────────────────────────────────────────────────

function AddEntryModal({ date, books, dayOrder, onClose, onSave }: {
  date: string
  books: Book[]
  dayOrder: number
  onClose: () => void
  onSave: (entry: BookEntry) => void
}) {
  const activeBooks = books.filter(b => !b.completed)
  const [inputMode, setInputMode] = useState<'select' | 'manual'>(activeBooks.length > 0 ? 'select' : 'manual')
  const [selectedBookId, setSelectedBookId] = useState('')
  const [title, setTitle] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition"

  const selectedBook = activeBooks.find(b => b.id === selectedBookId)
  const canSubmit = inputMode === 'select' ? !!selectedBookId : !!title.trim()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let finalTitle = title.trim()
      let finalImage = imagePreview
      if (inputMode === 'select' && selectedBook) {
        finalTitle = selectedBook.title
        finalImage = selectedBook.image_url ?? ''
      }
      if (imageFile) finalImage = await uploadCover(imageFile, `${date}-${dayOrder}`)
      const saved = await addEntry({ date, title: finalTitle, image_url: finalImage, summary: summary.trim(), day_order: dayOrder })
      onSave(saved)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-zinc-100 dark:border-zinc-800">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{date}</p>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
              {dayOrder === 1 ? 'Log a book' : `Add book #${dayOrder}`}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-lg">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {activeBooks.length > 0 && (
            <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 p-1 gap-1 bg-zinc-50 dark:bg-zinc-800">
              {(['select', 'manual'] as const).map(m => (
                <button key={m} type="button" onClick={() => setInputMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${inputMode === m ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'}`}>
                  {m === 'select' ? '📚 From library' : '✏️ Manual'}
                </button>
              ))}
            </div>
          )}

          {inputMode === 'select' ? (
            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
              {activeBooks.map(book => (
                <button key={book.id} type="button" onClick={() => setSelectedBookId(book.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${selectedBookId === book.id ? 'border-zinc-900 dark:border-zinc-300 bg-zinc-50 dark:bg-zinc-800' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                  {book.image_url
                    ? <img src={book.image_url} alt={book.title} className="w-8 shrink-0 rounded-md object-cover" style={{ aspectRatio: '2/3' }} />
                    : <div className="w-8 shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center text-xs" style={{ aspectRatio: '2/3' }}>📖</div>
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">{book.title}</p>
                    {book.author && <p className="text-xs text-zinc-400 truncate">{book.author}</p>}
                  </div>
                  {selectedBookId === book.id && <span className="ml-auto shrink-0 text-sm">✓</span>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Book Title *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Alchemist" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Cover Image</label>
                <ImageInput
                  preview={imagePreview}
                  onFile={(url, file) => { setImagePreview(url); setImageFile(file) }}
                  onUrl={url => { setImagePreview(url); setImageFile(null) }}
                  onClear={() => { setImageFile(null); setImagePreview('') }}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Reading Notes</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)}
              placeholder="What did you read or think about today?" rows={3}
              className={`${inputCls} resize-none`} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !canSubmit}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── ViewDayModal ─────────────────────────────────────────────────────────────

function ViewDayModal({ date, entries, initialIndex, onClose, onDelete, onAddAnother }: {
  date: string
  entries: BookEntry[]
  initialIndex: number
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onAddAnother: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [deleting, setDeleting] = useState(false)
  const entry = entries[index]
  const total = entries.length

  // keep index in bounds if entries shrink
  useEffect(() => {
    if (index >= entries.length && entries.length > 0) setIndex(entries.length - 1)
  }, [entries.length, index])

  if (!entry) return null

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(entry.id)
    setDeleting(false)
    // if deleted the last one, close; otherwise stay on same index (next entry slides in)
    if (total === 1) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-100 dark:border-zinc-800">

        {/* cover */}
        <div className="relative w-full h-56 bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          {entry.image_url
            ? <img src={entry.image_url} alt={entry.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-5xl">📖</div>
          }

          {/* top bar */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            {/* dot indicators */}
            <div className="flex gap-1.5">
              {entries.map((_, i) => (
                <button key={i} onClick={() => setIndex(i)}
                  className={`rounded-full transition-all ${i === index ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'}`} />
              ))}
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white text-lg transition-colors">×</button>
          </div>

          {/* prev / next arrows on cover */}
          {total > 1 && (
            <>
              <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-0 transition-all">‹</button>
              <button onClick={() => setIndex(i => Math.min(total - 1, i + 1))} disabled={index === total - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white disabled:opacity-0 transition-all">›</button>
            </>
          )}
        </div>

        {/* content */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{date} · Book {index + 1} of {total}</p>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-0.5 leading-snug">{entry.title}</h2>
            </div>
          </div>

          {entry.summary
            ? <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap mt-2 mb-4">{entry.summary}</p>
            : <p className="text-sm text-zinc-300 dark:text-zinc-600 italic mt-2 mb-4">No notes for this entry.</p>
          }

          <div className="flex gap-2">
            <button onClick={onAddAnother}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors">
              + Add another
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="py-2.5 px-4 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50">
              {deleting ? '…' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── LibraryTab ───────────────────────────────────────────────────────────────

function LibraryTab({ books, onAdd, onToggle, onDelete }: {
  books: Book[]
  onAdd: (b: { title: string; image_url: string; author: string }) => Promise<void>
  onToggle: (id: string, completed: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const active = books.filter(b => !b.completed)
  const completed = books.filter(b => b.completed)

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 focus:border-transparent transition"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      let finalImage = imagePreview
      if (imageFile) finalImage = await uploadCover(imageFile, title.trim())
      await onAdd({ title: title.trim(), author: author.trim(), image_url: finalImage })
      setTitle(''); setAuthor(''); setImageFile(null); setImagePreview(''); setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const BookRow = ({ book }: { book: Book }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors">
      {book.image_url
        ? <img src={book.image_url} alt={book.title} className="w-9 shrink-0 rounded-lg object-cover shadow" style={{ aspectRatio: '2/3' }} />
        : <div className="w-9 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm" style={{ aspectRatio: '2/3' }}>📖</div>
      }
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${book.completed ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-50'}`}>{book.title}</p>
        {book.author && <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{book.author}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onToggle(book.id, !book.completed)} title={book.completed ? 'Mark as reading' : 'Mark completed'}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${book.completed ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-600'}`}>✓</button>
        <button onClick={() => onDelete(book.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors">✕</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {showForm ? (
        <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex flex-col gap-3">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Add a book</p>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title *" required className={inputCls} />
          <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author (optional)" className={inputCls} />
          <div>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Cover</p>
            <ImageInput
              preview={imagePreview}
              onFile={(url, file) => { setImagePreview(url); setImageFile(file) }}
              onUrl={url => { setImagePreview(url); setImageFile(null) }}
              onClear={() => { setImageFile(null); setImagePreview('') }}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="flex-1 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 text-sm font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          + Add a book to library
        </button>
      )}

      {active.length > 0
        ? <div className="flex flex-col gap-2">{active.map(b => <BookRow key={b.id} book={b} />)}</div>
        : <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-4">No books in library yet.</p>
      }

      {completed.length > 0 && (
        <div>
          <button onClick={() => setShowCompleted(v => !v)} className="flex items-center gap-2 text-xs font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wide mb-2">
            <span>{showCompleted ? '▾' : '▸'}</span> Completed ({completed.length})
          </button>
          {showCompleted && <div className="flex flex-col gap-2">{completed.map(b => <BookRow key={b.id} book={b} />)}</div>}
        </div>
      )}
    </div>
  )
}

// ─── CalendarDay ──────────────────────────────────────────────────────────────

function CalendarDay({ day, entries, isToday, onClick }: {
  day: number; entries: BookEntry[]; isToday: boolean; onClick: () => void
}) {
  const first = entries[0]
  const extra = entries.length - 1

  return (
    <button onClick={onClick} style={{ aspectRatio: '2/3' }}
      className={`group relative w-full rounded-xl overflow-hidden border transition-all duration-150 ${
        first ? 'border-transparent shadow-sm hover:shadow-md hover:scale-[1.03]'
        : isToday ? 'border-zinc-900 dark:border-zinc-300 bg-zinc-50 dark:bg-zinc-800'
        : 'border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'
      }`}>
      {first?.image_url ? (
        <>
          <img src={first.image_url} alt={first.title} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-150 flex items-end p-1.5">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-semibold leading-tight line-clamp-2 text-left drop-shadow">{first.title}</span>
          </div>
          <span className="absolute top-1 left-1 text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{day}</span>
          {extra > 0 && (
            <span className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded-md">+{extra}</span>
          )}
        </>
      ) : first ? (
        <div className="absolute inset-0 bg-zinc-800 dark:bg-zinc-700 flex flex-col items-start justify-between p-2">
          <span className="text-[10px] font-bold text-zinc-400">{day}</span>
          <div>
            <span className="text-[9px] font-semibold text-white leading-tight line-clamp-2 text-left block">{first.title}</span>
            {extra > 0 && <span className="text-[9px] text-zinc-400 mt-0.5 block">+{extra} more</span>}
          </div>
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
  const [tab, setTab] = useState<Tab>('calendar')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [entryMap, setEntryMap] = useState<EntryMap>({})
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ mode: 'closed' })

  const loadEntries = useCallback(async (y: number, m: number) => {
    setLoading(true); setError(null)
    try {
      const data = await fetchMonthEntries(y, m)
      const map: EntryMap = {}
      data.forEach(e => {
        if (!map[e.date]) map[e.date] = []
        map[e.date].push(e)
      })
      setEntryMap(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBooks = useCallback(async () => {
    try { setBooks(await fetchBooks()) } catch {}
  }, [])

  useEffect(() => { loadEntries(year, month) }, [year, month, loadEntries])
  useEffect(() => { loadBooks() }, [loadBooks])

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const handleDayClick = (dateKey: string) => {
    const dayEntries = entryMap[dateKey]
    if (!dayEntries || dayEntries.length === 0) {
      setModal({ mode: 'add', date: dateKey })
    } else {
      setModal({ mode: 'view', date: dateKey, index: 0 })
    }
  }

  const handleEntrySaved = (entry: BookEntry) => {
    setEntryMap(prev => {
      const list = [...(prev[entry.date] ?? []), entry]
      return { ...prev, [entry.date]: list }
    })
  }

  const handleEntryDeleted = async (id: string, date: string) => {
    await deleteEntry(id)
    setEntryMap(prev => {
      const list = (prev[date] ?? []).filter(e => e.id !== id)
      const next = { ...prev }
      if (list.length === 0) delete next[date]
      else next[date] = list
      return next
    })
  }

  const totalDays = daysInMonth(year, month)
  const startDay = firstDayOfMonth(year, month)
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const totalRead = Object.values(entryMap).reduce((sum, arr) => sum + arr.length, 0)

  const viewDate = modal.mode === 'view' ? modal.date : null
  const viewEntries = viewDate ? (entryMap[viewDate] ?? []) : []

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Book Calendar</h1>
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">One book per day, forever.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex rounded-2xl border border-zinc-200 dark:border-zinc-700 p-1 gap-1 bg-zinc-100 dark:bg-zinc-800 mb-6">
          {(['calendar', 'library'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'}`}>
              {t === 'calendar' ? '📅 Calendar' : '📚 Library'}
            </button>
          ))}
        </div>

        {tab === 'calendar' ? (
          <>
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
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">⚠️ {error}</div>
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
                    <CalendarDay key={dateKey} day={day}
                      entries={entryMap[dateKey] ?? []}
                      isToday={dateKey === todayKey}
                      onClick={() => handleDayClick(dateKey)} />
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-4 mt-6 text-xs text-zinc-400 dark:text-zinc-600">
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-zinc-800 dark:bg-zinc-700" /><span>Logged</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded border border-zinc-900 dark:border-zinc-300" /><span>Today</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" /><span>Empty</span></div>
            </div>
          </>
        ) : (
          <LibraryTab
            books={books}
            onAdd={async b => { await saveBook(b); await loadBooks() }}
            onToggle={async (id, completed) => { await toggleBookCompleted(id, completed); await loadBooks() }}
            onDelete={async id => { await deleteBook(id); await loadBooks() }}
          />
        )}
      </div>

      {/* Modals */}
      {modal.mode === 'add' && (
        <AddEntryModal
          date={modal.date}
          books={books}
          dayOrder={(entryMap[modal.date]?.length ?? 0) + 1}
          onClose={() => setModal({ mode: 'closed' })}
          onSave={entry => {
            handleEntrySaved(entry)
            // after saving, open view modal on the new entry
            setModal({ mode: 'view', date: entry.date, index: (entryMap[entry.date]?.length ?? 0) })
          }}
        />
      )}

      {modal.mode === 'view' && viewEntries.length > 0 && (
        <ViewDayModal
          date={modal.date}
          entries={viewEntries}
          initialIndex={modal.index}
          onClose={() => setModal({ mode: 'closed' })}
          onDelete={async id => { await handleEntryDeleted(id, modal.date) }}
          onAddAnother={() => setModal({ mode: 'add', date: modal.date })}
        />
      )}
    </div>
  )
}
