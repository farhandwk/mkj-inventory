'use client'

import { useState, useEffect, useMemo, useRef } from "react"
import {
  Calculator, Printer, Loader2, Save, Zap, Droplets, Users, Wrench,
  PieChart, SlidersHorizontal, TrendingUp, AlertCircle
} from "lucide-react"
import Chart from "chart.js/auto"
import { createClient } from "@/lib/supabase"

// =========================================================
// TIPE DATA (diselaraskan dengan schema Supabase)
// =========================================================
type ProductRef = { id: string; name: string; unit: string; selling_price: number }
type OrderItemRow = {
  qty: number
  product_id: string
  unit_selling_price?: number | null
  unit_hpp_cost?: number | null
  products?: ProductRef | ProductRef[] | null
}
type OrderRow = {
  id: string
  order_date: string
  completed_date: string | null
  status: string
  order_items?: OrderItemRow[]
}
type Recipe = { product_id: string; material_id: string; qty_per_kg: number }
type Material = { id: string; name: string; price_per_unit: number }
type Overhead = { electricity: number; water: number; labor: number; other_operations: number }
type Periode = 'hari' | 'minggu' | 'bulan' | 'tahun' | 'custom'
type Bucket = { label: string; from: string; to: string }

// =========================================================
// HELPER FORMAT & TANGGAL (tanggal lokal, format YYYY-MM-DD)
// =========================================================
const formatRp = (val: number) => "Rp " + Math.round(val).toLocaleString('id-ID')
const formatNum = (val: number) =>
  Number(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const compactRp = (v: number | string) =>
  "Rp " + new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))

const pad = (n: number) => String(n).padStart(2, '0')
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYMD = (s: string) => new Date(`${s}T00:00:00`)
const addDays = (s: string, n: number) => {
  const d = parseYMD(s)
  d.setDate(d.getDate() + n)
  return toYMD(d)
}
const diffDays = (a: string, b: string) =>
  Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86400000)
const shortDate = (s: string) => {
  const d = parseYMD(s)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

const DAY_LABELS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
const PIE_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e']

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? "")
  return isNaN(n) ? 0 : n
}

function getRange(periode: Periode, customStart: string, customEnd: string) {
  const today = toYMD(new Date())

  if (periode === 'hari') {
    return { start: today, end: today, days: 1, factor: 1 / 30, label: "1 Hari Pro-Rata" }
  }

  if (periode === 'minggu') {
    const dow = (parseYMD(today).getDay() + 6) % 7
    const start = addDays(today, -dow)
    return { start, end: addDays(start, 6), days: 7, factor: 7 / 30, label: "7 Hari Pro-Rata" }
  }

  if (periode === 'bulan') {
    const now = parseYMD(today)
    const y = now.getFullYear()
    const m = now.getMonth()
    const start = `${y}-${pad(m + 1)}-01`
    const end = toYMD(new Date(y, m + 1, 0))
    return { start, end, days: diffDays(start, end) + 1, factor: 1, label: "30 Hari (Bulanan)" }
  }

  if (periode === 'tahun') {
    const y = parseYMD(today).getFullYear()
    const start = `${y}-01-01`
    const end = `${y}-12-31`
    return { start, end, days: diffDays(start, end) + 1, factor: 12, label: "12 Bulan (Tahunan)" }
  }

  let start = customStart || today
  let end = customEnd || today
  if (end < start) [start, end] = [end, start]
  const days = diffDays(start, end) + 1
  return { start, end, days, factor: days / 30, label: `${days} Hari Custom` }
}

function buildBuckets(periode: Periode, r: { start: string; end: string; days: number }): Bucket[] {
  if (periode === 'hari') {
    return [{ label: shortDate(r.start), from: r.start, to: r.end }]
  }
  if (periode === 'minggu') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(r.start, i)
      return { label: DAY_LABELS[i], from: d, to: d }
    })
  }
  if (periode === 'bulan') {
    const ym = r.start.slice(0, 7)
    const cuts: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, r.days]]
    return cuts.map(([a, b], i) => ({
      label: `Minggu ${i + 1}`,
      from: `${ym}-${pad(a)}`,
      to: `${ym}-${pad(b)}`
    }))
  }
  if (periode === 'tahun') {
    const y = Number(r.start.slice(0, 4))
    return Array.from({ length: 12 }, (_, m) => ({
      label: MONTH_LABELS[m],
      from: `${y}-${pad(m + 1)}-01`,
      to: toYMD(new Date(y, m + 1, 0))
    }))
  }
  const step = r.days <= 14 ? 1 : Math.ceil(r.days / 8)
  const out: Bucket[] = []
  for (let off = 0; off < r.days; off += step) {
    const from = addDays(r.start, off)
    const to = addDays(r.start, Math.min(off + step - 1, r.days - 1))
    out.push({ label: from === to ? shortDate(from) : `${shortDate(from)}–${shortDate(to)}`, from, to })
  }
  return out
}

export default function FinanceTab() {
  const supabase = useMemo(() => createClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [savedOverhead, setSavedOverhead] = useState<Overhead>({
    electricity: 0, water: 0, labor: 0, other_operations: 0
  })

  const [overheadForm, setOverheadForm] = useState({
    electricity: "", water: "", labor: "", other_operations: ""
  })
  const [isSavingOverhead, setIsSavingOverhead] = useState(false)

  const todayStr = toYMD(new Date())
  const [periode, setPeriode] = useState<Periode>('bulan')
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 7)}-01`)
  const [customEnd, setCustomEnd] = useState(todayStr)

  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const lineCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const lineChartRef = useRef<Chart | null>(null)
  const pieChartRef = useRef<Chart | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    setLoadError(null)

    const [orderRes, recipeRes, materialRes, overheadRes] = await Promise.all([
      supabase.from('orders').select(`
        id, order_date, completed_date, status,
        order_items (
          qty,
          product_id,
          unit_selling_price,
          unit_hpp_cost,
          products (id, name, unit, selling_price)
        )
      `),
      supabase.from('recipes').select('product_id, material_id, qty_per_kg'),
      supabase.from('materials').select('id, name, price_per_unit'),
      supabase.from('overhead_costs')
        .select('electricity, water, labor, other_operations')
        .eq('id', 1)
        .maybeSingle()
    ])

    const firstError = orderRes.error || recipeRes.error || materialRes.error || overheadRes.error
    if (firstError) setLoadError(firstError.message)

    if (orderRes.data) setOrders(orderRes.data as unknown as OrderRow[])
    if (recipeRes.data) setRecipes(recipeRes.data as Recipe[])
    if (materialRes.data) setMaterials(materialRes.data as Material[])
    if (overheadRes.data) {
      const o = overheadRes.data as Record<string, unknown>
      const loaded: Overhead = {
        electricity: num(o.electricity as string | number),
        water: num(o.water as string | number),
        labor: num(o.labor as string | number),
        other_operations: num(o.other_operations as string | number)
      }
      setSavedOverhead(loaded)
      setOverheadForm({
        electricity: String(loaded.electricity),
        water: String(loaded.water),
        labor: String(loaded.labor),
        other_operations: String(loaded.other_operations)
      })
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const currentOverhead: Overhead = {
    electricity: num(overheadForm.electricity),
    water: num(overheadForm.water),
    labor: num(overheadForm.labor),
    other_operations: num(overheadForm.other_operations)
  }

  const isOverheadDirty =
    currentOverhead.electricity !== savedOverhead.electricity ||
    currentOverhead.water !== savedOverhead.water ||
    currentOverhead.labor !== savedOverhead.labor ||
    currentOverhead.other_operations !== savedOverhead.other_operations

  const handleSaveOverhead = async () => {
    setIsSavingOverhead(true)
    const { error } = await supabase.from('overhead_costs').upsert(
      { id: 1, ...currentOverhead, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
    setIsSavingOverhead(false)

    if (error) {
      alert(`Gagal menyimpan biaya overhead: ${error.message}`)
    } else {
      setSavedOverhead(currentOverhead)
    }
  }

  // Fallback HPP per unit dari master saat ini jika snapshot belum ada
  const fallbackHppPerUnit = useMemo(() => {
    const priceById = new Map(materials.map(m => [m.id, num(m.price_per_unit)]))
    const map = new Map<string, number>()
    recipes.forEach(r => {
      map.set(
        r.product_id,
        (map.get(r.product_id) || 0) + num(r.qty_per_kg) * (priceById.get(r.material_id) || 0)
      )
    })
    return map
  }, [materials, recipes])

  // Baris penjualan menggunakan harga jual & HPP yang dikunci saat pesanan dibuat
  const saleLines = useMemo(() => {
    const lines: {
      date: string
      productId: string
      name: string
      unit: string
      qty: number
      lockedPrice: number
      lockedHppUnit: number
    }[] = []

    orders.forEach(order => {
      const st = order.status?.toLowerCase() || ""
      if (!(st.includes('complet') || st === 'selesai')) return
      const date = order.completed_date || order.order_date
      order.order_items?.forEach(item => {
        const p = Array.isArray(item.products) ? item.products[0] : item.products
        const lockedPrice =
          item.unit_selling_price !== undefined && item.unit_selling_price !== null
            ? num(item.unit_selling_price)
            : num(p?.selling_price)
        const lockedHppUnit =
          item.unit_hpp_cost !== undefined && item.unit_hpp_cost !== null
            ? num(item.unit_hpp_cost)
            : (fallbackHppPerUnit.get(item.product_id) || 0)

        lines.push({
          date,
          productId: item.product_id,
          name: p?.name || 'Produk Custom',
          unit: p?.unit || 'Kg',
          qty: num(item.qty),
          lockedPrice,
          lockedHppUnit
        })
      })
    })
    return lines
  }, [orders, fallbackHppPerUnit])

  const range = useMemo(
    () => getRange(periode, customStart, customEnd),
    [periode, customStart, customEnd]
  )

  const summary = useMemo(() => {
    const perProductMap = new Map<string, {
      productId: string
      name: string
      unit: string
      qty: number
      revenue: number
      hppBahan: number
      keuntungan: number
      avgHppUnit: number
    }>()

    saleLines.forEach(l => {
      if (l.date < range.start || l.date > range.end) return
      const lineRev = l.qty * l.lockedPrice
      const lineHpp = l.qty * l.lockedHppUnit
      const row = perProductMap.get(l.productId) || {
        productId: l.productId,
        name: l.name,
        unit: l.unit,
        qty: 0,
        revenue: 0,
        hppBahan: 0,
        keuntungan: 0,
        avgHppUnit: l.lockedHppUnit
      }
      row.qty += l.qty
      row.revenue += lineRev
      row.hppBahan += lineHpp
      row.keuntungan += (lineRev - lineHpp)
      row.avgHppUnit = row.qty > 0 ? row.hppBahan / row.qty : l.lockedHppUnit
      perProductMap.set(l.productId, row)
    })

    const perProduct = Array.from(perProductMap.values()).sort((a, b) => b.revenue - a.revenue)
    const totalPendapatan = perProduct.reduce((s, p) => s + p.revenue, 0)
    const totalHppBahan = perProduct.reduce((s, p) => s + p.hppBahan, 0)
    const keuntungan = totalPendapatan - totalHppBahan

    const baseOverhead =
      currentOverhead.electricity + currentOverhead.water +
      currentOverhead.labor + currentOverhead.other_operations
    const activeOverhead = baseOverhead * range.factor

    const margin = totalPendapatan > 0 ? (keuntungan / totalPendapatan) * 100 : 0

    return {
      perProduct,
      totalPendapatan,
      totalHppBahan,
      keuntungan,
      baseOverhead,
      activeOverhead,
      margin
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleLines, range, overheadForm])

  const chartData = useMemo(() => {
    const buckets = buildBuckets(periode, range)
    const revenue: number[] = []
    const profit: number[] = []

    buckets.forEach(b => {
      let rev = 0
      let hpp = 0
      saleLines.forEach(l => {
        if (l.date >= b.from && l.date <= b.to) {
          rev += l.qty * l.lockedPrice
          hpp += l.qty * l.lockedHppUnit
        }
      })
      revenue.push(Math.round(rev))
      profit.push(Math.round(rev - hpp))
    })

    return { labels: buckets.map(b => b.label), revenue, profit }
  }, [periode, range, saleLines])

  const pieData = useMemo(() => ({
    labels: summary.perProduct.map(p => p.name),
    values: summary.perProduct.map(p => p.qty)
  }), [summary.perProduct])

  const productsWithoutRecipe = summary.perProduct.filter(p => p.avgHppUnit === 0)

  useEffect(() => {
    if (isLoading) return

    if (lineCanvasRef.current) {
      lineChartRef.current = new Chart(lineCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Pendapatan (Omzet)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.12)', borderWidth: 3, fill: true, tension: 0.4 },
            { label: 'Keuntungan (Omzet - HPP)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, borderDash: [5, 5], fill: false, tension: 0.4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatRp(Number(ctx.parsed.y))}`
              }
            }
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
            y: { ticks: { color: '#94a3b8', callback: (v) => compactRp(v) }, grid: { color: 'rgba(148,163,184,0.12)' } }
          }
        }
      })
    }

    if (pieCanvasRef.current) {
      pieChartRef.current = new Chart(pieCanvasRef.current, {
        type: 'doughnut',
        data: {
          labels: [],
          datasets: [{ data: [], backgroundColor: PIE_COLORS, borderColor: 'transparent', borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${Number(ctx.parsed).toLocaleString('id-ID')}`
              }
            }
          }
        }
      })
    }

    return () => {
      lineChartRef.current?.destroy()
      pieChartRef.current?.destroy()
      lineChartRef.current = null
      pieChartRef.current = null
    }
  }, [isLoading])

  useEffect(() => {
    if (isLoading) return

    const lc = lineChartRef.current
    if (lc) {
      ;(lc.config as { type: string }).type = chartType
      lc.data.labels = chartData.labels
      lc.data.datasets[0].data = chartData.revenue
      lc.data.datasets[1].data = chartData.profit
      lc.update()
    }

    const pc = pieChartRef.current
    if (pc) {
      pc.data.labels = pieData.labels
      pc.data.datasets[0].data = pieData.values
      pc.update()
    }
  }, [isLoading, chartData, chartType, pieData])

  const inputClass = "w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-semibold focus:border-vision-cyan outline-none"

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Menghitung Rekapitulasi Finansial...</p>
      </div>
    )
  }

  return (
    <>
      {/* =========================================================
          TAMPILAN DASHBOARD INTERAKTIF DI LAYAR (DISEMBUNYIKAN SAAT PRINT)
         ========================================================= */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">

        {/* HEADER */}
        <div className="vision-glass p-5 rounded-3xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white text-2xl shadow-glow-cyan">
              <Calculator size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">Laporan Analisis Keuangan & HPP</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                UMKM Mie Kurnia Jaya • Harga jual & HPP dikunci saat pesanan dibuat • Keuntungan = Pendapatan - HPP Bahan Baku
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border">
              <span className="text-xs text-muted-foreground pl-2 font-medium">Periode:</span>
              <select
                value={periode}
                onChange={e => setPeriode(e.target.value as Periode)}
                className="bg-background text-foreground text-xs font-semibold px-3 py-1.5 rounded-xl border border-border focus:border-vision-cyan outline-none cursor-pointer"
              >
                <option value="hari">Hari Ini (1 Hari)</option>
                <option value="minggu">Minggu Ini (7 Hari)</option>
                <option value="bulan">Bulan Ini (30 Hari)</option>
                <option value="tahun">Tahun Ini (365 Hari)</option>
                <option value="custom">Custom Rentang Tanggal</option>
              </select>
            </div>

            {periode === 'custom' && (
              <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-background text-foreground text-xs font-semibold px-2.5 py-1 rounded-xl border border-border outline-none cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">s/d</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-background text-foreground text-xs font-semibold px-2.5 py-1 rounded-xl border border-border outline-none cursor-pointer"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-vision-emerald to-vision-cyan text-white font-black text-xs flex items-center gap-2 shadow-glow-cyan hover:opacity-90 transition-all"
            >
              <Printer size={14} />
              <span>Cetak Laporan (PDF)</span>
            </button>
          </div>
        </div>

        {loadError && (
          <div className="vision-glass p-4 rounded-2xl border border-vision-rose/40 text-xs text-vision-rose flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>Sebagian data gagal dimuat dari database: {loadError}</span>
          </div>
        )}

        {/* KPI KEUANGAN CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="vision-glass p-4 rounded-2xl border-l-4 border-l-vision-cyan relative overflow-hidden">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Pendapatan</span>
            <h3 className="text-lg font-black text-vision-cyan mt-1 truncate">{formatRp(summary.totalPendapatan)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Harga saat pesanan dibuat</p>
          </div>

          <div className="vision-glass p-4 rounded-2xl border-l-4 border-l-vision-purple relative overflow-hidden">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">HPP Bahan Baku</span>
            <h3 className="text-lg font-black text-vision-purple mt-1 truncate">{formatRp(summary.totalHppBahan)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Resep × Harga bahan saat pesan</p>
          </div>

          <div className="vision-glass p-4 rounded-2xl border-l-4 border-l-vision-emerald relative overflow-hidden">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Keuntungan</span>
            <h3 className="text-lg font-black text-vision-emerald mt-1 truncate">{formatRp(summary.keuntungan)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Pendapatan - HPP Bahan Baku</p>
          </div>

          <div className="vision-glass p-4 rounded-2xl border-l-4 border-l-vision-blue relative overflow-hidden">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Profit Margin</span>
            <h3 className="text-lg font-black text-vision-blue mt-1 truncate">{summary.margin.toFixed(1)}%</h3>
            <p className="text-[10px] text-muted-foreground mt-1">(Keuntungan / Pendapatan)</p>
          </div>
        </div>

        {/* GRAFIK KEUANGAN + FORM OVERHEAD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="text-vision-cyan" size={18} /> Grafik Pendapatan & Keuntungan
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Perbandingan Pendapatan vs Keuntungan (Pendapatan - HPP Bahan Baku).</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 rounded-lg border border-border text-xs font-semibold ${chartType === 'line' ? 'bg-vision-cyan/20 text-vision-cyan' : 'bg-muted text-muted-foreground'}`}
                >
                  Garis
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1 rounded-lg border border-border text-xs font-semibold ${chartType === 'bar' ? 'bg-vision-purple/20 text-vision-purple' : 'bg-muted text-muted-foreground'}`}
                >
                  Batang
                </button>
              </div>
            </div>
            <div className="h-[340px] w-full pt-2">
              <canvas ref={lineCanvasRef}></canvas>
            </div>
          </div>

          <div className="lg:col-span-5 vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="border-b border-border pb-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <SlidersHorizontal className="text-vision-amber" size={18} /> Form Biaya Overhead (Bulanan)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Catatan biaya operasional (tidak mengurangi rumus Keuntungan).</p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-vision-amber/15 text-vision-amber border border-vision-amber/30 text-[10px] font-bold whitespace-nowrap">
                Base 30 Hari
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Zap size={13} className="text-vision-amber" /> Biaya Listrik</span>
                  <span className="text-[10px] text-muted-foreground">Nominal/Bulan</span>
                </label>
                <input
                  type="number" min="0" placeholder="0"
                  value={overheadForm.electricity}
                  onChange={e => setOverheadForm({ ...overheadForm, electricity: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Droplets size={13} className="text-vision-cyan" /> Biaya Air</span>
                  <span className="text-[10px] text-muted-foreground">Nominal/Bulan</span>
                </label>
                <input
                  type="number" min="0" placeholder="0"
                  value={overheadForm.water}
                  onChange={e => setOverheadForm({ ...overheadForm, water: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Users size={13} className="text-vision-purple" /> Tenaga Kerja (Gaji)</span>
                  <span className="text-[10px] text-muted-foreground">Nominal/Bulan</span>
                </label>
                <input
                  type="number" min="0" placeholder="0"
                  value={overheadForm.labor}
                  onChange={e => setOverheadForm({ ...overheadForm, labor: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Wrench size={13} className="text-vision-rose" /> Operasional Lainnya</span>
                  <span className="text-[10px] text-muted-foreground">Nominal/Bulan</span>
                </label>
                <input
                  type="number" min="0" placeholder="0"
                  value={overheadForm.other_operations}
                  onChange={e => setOverheadForm({ ...overheadForm, other_operations: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="bg-muted/40 p-3.5 rounded-2xl border border-border space-y-1.5 mt-3">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Total Base Overhead (Bulanan):</span>
                  <span className="font-bold text-foreground">{formatRp(summary.baseOverhead)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1.5 text-vision-amber">
                  <span className="font-semibold">Overhead Pro-Rata ({range.label}):</span>
                  <span className="font-black text-sm">{formatRp(summary.activeOverhead)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveOverhead}
                disabled={isSavingOverhead || !isOverheadDirty}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center justify-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-40"
              >
                {isSavingOverhead ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isOverheadDirty ? 'Simpan Biaya Overhead' : 'Biaya Overhead Tersimpan'}
              </button>
            </div>
          </div>
        </div>

        {/* RINCIAN BAHAN BAKU PER PRODUK */}
        <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <PieChart className="text-vision-purple" size={18} /> Analisis Penjualan, HPP Bahan Baku & Keuntungan per Produk
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Menggunakan harga jual dan HPP bahan baku yang dikunci saat pesanan dibuat.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-2">
            <div className="lg:col-span-7 overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[620px]">
                <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                  <tr>
                    <th className="pb-3 px-3 font-semibold text-left">Nama Produk</th>
                    <th className="pb-3 px-3 font-semibold text-center">Terjual</th>
                    <th className="pb-3 px-3 font-semibold text-right">Pendapatan</th>
                    <th className="pb-3 px-3 font-semibold text-right">HPP Bahan Baku</th>
                    <th className="pb-3 px-3 font-semibold text-right">Keuntungan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-foreground">
                  {summary.perProduct.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground italic">
                        Belum ada pesanan selesai pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    summary.perProduct.map(p => (
                      <tr key={p.productId} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 text-left">
                          <div className="font-bold">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">HPP {formatRp(p.avgHppUnit)}/{p.unit}</div>
                        </td>
                        <td className="py-2.5 px-3 text-vision-cyan font-extrabold text-center">
                          {formatNum(p.qty)} {p.unit}
                        </td>
                        <td className="py-2.5 px-3 text-vision-cyan font-extrabold text-right">{formatRp(p.revenue)}</td>
                        <td className="py-2.5 px-3 text-vision-purple font-bold text-right">{formatRp(p.hppBahan)}</td>
                        <td className="py-2.5 px-3 text-vision-emerald font-extrabold text-right">{formatRp(p.keuntungan)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {productsWithoutRecipe.length > 0 && (
                <p className="mt-3 text-[11px] text-vision-amber flex items-start gap-1.5">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    Belum ada resep untuk: {productsWithoutRecipe.map(p => p.name).join(', ')}. HPP bahan dihitung Rp 0.
                  </span>
                </p>
              )}
            </div>

            <div className="lg:col-span-5 h-[240px] w-full relative flex items-center justify-center">
              <canvas ref={pieCanvasRef}></canvas>
            </div>
          </div>
        </div>

      </div>

      {/* =========================================================
          DOKUMEN LAPORAN KEUANGAN FORMAL KHUSUS CETAK / EXPORT PDF
         ========================================================= */}
      <div className="hidden print:block bg-white text-slate-900 p-6 font-sans">
        {/* Kop Laporan */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Laporan Keuangan Resmi
            </p>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">
              UMKM MIE KURNIA JAYA
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Analisis Pendapatan, HPP Bahan Baku &amp; Keuntungan Penjualan
            </p>
          </div>
          <div className="text-right text-xs text-slate-600 space-y-0.5">
            <p><span className="font-semibold text-slate-800">Periode:</span> {range.start} s/d {range.end}</p>
            <p><span className="font-semibold text-slate-800">Cakupan:</span> {range.label}</p>
            <p><span className="font-semibold text-slate-800">Tanggal Cetak:</span> {todayStr}</p>
          </div>
        </div>

        {/* Ringkasan Angka Utama */}
        <div className="grid grid-cols-4 gap-3 mt-5">
          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70">
            <p className="text-[10px] font-bold uppercase text-slate-500">Total Pendapatan</p>
            <p className="text-base font-black text-slate-900 mt-1">{formatRp(summary.totalPendapatan)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Harga saat pesanan dibuat</p>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70">
            <p className="text-[10px] font-bold uppercase text-slate-500">Total HPP Bahan Baku</p>
            <p className="text-base font-black text-slate-900 mt-1">{formatRp(summary.totalHppBahan)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Resep × Harga bahan saat pesan</p>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 bg-emerald-50/70">
            <p className="text-[10px] font-bold uppercase text-emerald-800">Keuntungan</p>
            <p className="text-base font-black text-emerald-700 mt-1">{formatRp(summary.keuntungan)}</p>
            <p className="text-[10px] text-emerald-700/80 mt-0.5">Pendapatan - HPP Bahan Baku</p>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70">
            <p className="text-[10px] font-bold uppercase text-slate-500">Profit Margin</p>
            <p className="text-base font-black text-slate-900 mt-1">{summary.margin.toFixed(1)}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Keuntungan / Pendapatan</p>
          </div>
        </div>

        {/* Tabel Rincian Per Produk */}
        <div className="mt-6">
          <h2 className="text-sm font-extrabold text-slate-900 mb-2">
            Rincian Penjualan, HPP Bahan Baku &amp; Keuntungan per Produk
          </h2>
          <table className="w-full text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                <th className="border border-slate-300 px-3 py-2 text-left">Produk</th>
                <th className="border border-slate-300 px-3 py-2 text-right">Terjual</th>
                <th className="border border-slate-300 px-3 py-2 text-right">HPP / Unit</th>
                <th className="border border-slate-300 px-3 py-2 text-right">Pendapatan</th>
                <th className="border border-slate-300 px-3 py-2 text-right">HPP Bahan Baku</th>
                <th className="border border-slate-300 px-3 py-2 text-right">Keuntungan</th>
              </tr>
            </thead>
            <tbody>
              {summary.perProduct.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-slate-300 px-3 py-4 text-center text-slate-500 italic">
                    Tidak ada transaksi pesanan selesai pada periode terpilih.
                  </td>
                </tr>
              ) : (
                summary.perProduct.map(p => (
                  <tr key={p.productId}>
                    <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-slate-800">
                      {formatNum(p.qty)} {p.unit}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-slate-700">
                      {formatRp(p.avgHppUnit)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-semibold text-slate-900">
                      {formatRp(p.revenue)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-slate-800">
                      {formatRp(p.hppBahan)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-bold text-emerald-700">
                      {formatRp(p.keuntungan)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {summary.perProduct.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900">
                  <td className="border border-slate-300 px-3 py-2" colSpan={3}>TOTAL</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatRp(summary.totalPendapatan)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatRp(summary.totalHppBahan)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-emerald-700">{formatRp(summary.keuntungan)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Informasi Tambahan Biaya Overhead (Catatan Terpisah) */}
        <div className="mt-6 border border-slate-300 rounded-lg p-3.5 bg-slate-50/60 text-xs">
          <p className="font-bold text-slate-800 mb-2">
            Catatan Biaya Overhead Operasional (Informasi Terpisah, Tidak Mengurangi Rumus Keuntungan)
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-slate-700">
            <div className="flex justify-between">
              <span>Biaya Listrik (Bulanan):</span>
              <span className="font-semibold">{formatRp(currentOverhead.electricity)}</span>
            </div>
            <div className="flex justify-between">
              <span>Biaya Air (Bulanan):</span>
              <span className="font-semibold">{formatRp(currentOverhead.water)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tenaga Kerja (Bulanan):</span>
              <span className="font-semibold">{formatRp(currentOverhead.labor)}</span>
            </div>
            <div className="flex justify-between">
              <span>Operasional Lainnya (Bulanan):</span>
              <span className="font-semibold">{formatRp(currentOverhead.other_operations)}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-300 flex justify-between font-bold text-slate-900">
            <span>Total Base Overhead (30 Hari) / Pro-Rata ({range.label}):</span>
            <span>{formatRp(summary.baseOverhead)} / {formatRp(summary.activeOverhead)}</span>
          </div>
        </div>

        {/* Footer Laporan */}
        <div className="mt-6 pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500">
          <span>Sistem Informasi Manajemen &amp; Keuangan — Mie Kurnia Jaya</span>
          <span>Keuntungan dihitung dari Pendapatan dikurangi HPP Bahan Baku</span>
        </div>
      </div>
    </>
  )
}