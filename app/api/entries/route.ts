import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/entries?year=2026&month=5  (month is 1-indexed)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const year = searchParams.get('year')
  const month = searchParams.get('month') // 1-indexed

  let query = supabase.from('book_entries').select('*').order('date', { ascending: true })

  if (year && month) {
    const y = Number(year)
    const m = Number(month) // 1-indexed, e.g. May = 5
    const paddedMonth = String(m).padStart(2, '0')
    const start = `${y}-${paddedMonth}-01`
    // new Date(y, m, 0): JS months are 0-indexed, so m (1-indexed) = next month 0-indexed
    // day 0 = last day of previous month → gives last day of month m. e.g. new Date(2026,5,0) = May 31 ✓
    const lastDay = new Date(y, m, 0).getDate()
    const end = `${y}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`
    query = query.gte('date', start).lte('date', end)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// POST /api/entries
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, title, image_url, summary } = body

  if (!date || !title) {
    return Response.json({ error: 'date and title are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('book_entries')
    .upsert({ date, title, image_url, summary }, { onConflict: 'date' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
