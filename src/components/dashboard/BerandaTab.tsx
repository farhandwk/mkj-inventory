'use client'

import { useState, useEffect, useMemo, useRef } from "react"
import {
  PieChart, TrendingUp, TrendingDown, PackageOpen, Receipt, Crown,
  Download, Loader2, AlertCircle
} from "lucide-react"
import Chart from "chart.js/auto"
import { createClient } from "@/lib/supabase"

// =========================================================
// TIPE DATA (diselaraskan dengan schema Supabase)
// =========================================================
type ProductRef = { id: string; name: string; unit: string; selling_price: number }
type OrderRow = {
  id: string
  order_date: string
  completed_date: string | null
  status: string
  order_items?: {
    qty: number
    product_id: string
    products?: ProductRef | ProductRef[] | null
  }[]
}
type Periode = 'hari' | 'minggu' | 'bulan' | 'tahun' | 'custom'
type Bucket = { label: string; from: string; to: string }
type DateRange = { start: string; end: string; days: number }

// =========================================================
// HELPER FORMAT & TANGGAL (tanggal lokal, format YYYY-MM-DD)
// =========================================================
const formatRp = (val: number) => "Rp " + Math.round(val).toLocaleString('id-ID')
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
const minDate = (a: string, b: string) => (a < b ? a : b)

const DAY_LABELS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
const PIE_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e']
const PERIODE_LABEL: Record<Periode, string> = {
  hari: 'Hari Ini',
  minggu: 'Minggu Ini',
  bulan: 'Bulan Ini',
  tahun: 'Tahun Ini',
  custom: 'Custom'
}

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? "")
  return isNaN(n) ? 0 : n
}

// Rentang tanggal untuk periode terpilih
function getRange(periode: Periode, customStart: string, customEnd: string): DateRange {
  const today = toYMD(new Date())

  if (periode === 'hari') return { start: today, end: today, days: 1 }

  if (periode === 'minggu') {
    const dow = (parseYMD(today).getDay() + 6) % 7 // Senin = 0
    const start = addDays(today, -dow)
    return { start, end: addDays(start, 6), days: 7 }
  }

  if (periode === 'bulan') {
    const now = parseYMD(today)
    const y = now.getFullYear()
    const m = now.getMonth()
    const start = `${y}-${pad(m + 1)}-01`
    const end = toYMD(new Date(y, m + 1, 0))
    return { start, end, days: diffDays(start, end) + 1 }
  }

  if (periode === 'tahun') {
    const y = parseYMD(today).getFullYear()
    const start = `${y}-01-01`
    const end = `${y}-12-31`
    return { start, end, days: diffDays(start, end) + 1 }
  }

  let start = customStart || today
  let end = customEnd || today
  if (end < start) [start, end] = [end, start]
  return { start, end, days: diffDays(start, end) + 1 }
}

// Periode pembanding (periode sebelumnya). Bila periode berjalan belum selesai,
// pembanding dipotong sepanjang hari yang sudah berjalan agar perbandingannya adil.
function getPrevRange(periode: Periode, range: DateRange): DateRange {
  const today = toYMD(new Date())
  let start: string
  let end: string

  if (periode === 'hari') {
    start = end = addDays(range.start, -1)
  } else if (periode === 'minggu') {
    start = addDays(range.start, -7)
    end = addDays(range.end, -7)
  } else if (periode === 'bulan') {
    const d = parseYMD(range.start)
    start = toYMD(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    end = toYMD(new Date(d.getFullYear(), d.getMonth(), 0))
  } else if (periode === 'tahun') {
    const y = parseYMD(range.start).getFullYear() - 1
    start = `${y}-01-01`
    end = `${y}-12-31`
  } else {
    end = addDays(range.start, -1)
    start = addDays(end, -(range.days - 1))
  }

  const elapsed = diffDays(range.start, minDate(range.end, today)) + 1
  if (elapsed > 0 && elapsed < range.days) {
    end = minDate(end, addDays(start, elapsed - 1))
  }
  return { start, end, days: diffDays(start, end) + 1 }
}

// Pembagian sumbu X grafik sesuai periode
function buildBuckets(periode: Periode, r: DateRange): Bucket[] {
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

// Persentase perubahan terhadap periode sebelumnya (null bila tidak ada pembanding)
const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

function TrendLine({ pct, suffix }: { pct: number | null; suffix: string }) {
  if (pct === null) {
    return <p className="text-[11px] text-muted-foreground mt-2">Belum ada data periode sebelumnya</p>
  }
  const up = pct >= 0
  return (
    <p className={`text-[11px] mt-2 font-semibold flex items-center gap-1 ${up ? 'text-vision-emerald' : 'text-vision-rose'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{pct.toFixed(1)}% {suffix}
    </p>
  )
}

const csvEscape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

export default function BerandaTab() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])

  // Filter periode
  const todayStr = toYMD(new Date())
  const [periode, setPeriode] = useState<Periode>('bulan')
  const [customStart, setCustomStart] = useState(`${todayStr.slice(0, 7)}-01`)
  const [customEnd, setCustomEnd] = useState(todayStr)

  // Grafik
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const lineCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const lineChartRef = useRef<Chart | null>(null)
  const pieChartRef = useRef<Chart | null>(null)

  // =========================================================
  // FETCH DATA
  // =========================================================
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setLoadError(null)

      const { data, error } = await supabase.from('orders').select(`
        id, order_date, completed_date, status,
        order_items (
          qty,
          product_id,
          products (id, name, unit, selling_price)
        )
      `)

      if (error) setLoadError(error.message)
      if (data) setOrders(data as unknown as OrderRow[])
      setIsLoading(false)
    }

    fetchData()
  }, [])

  // =========================================================
  // OLAH DATA
  // =========================================================
  // Baris penjualan dari pesanan selesai + meta semua pesanan (untuk tingkat pemenuhan)
  const { saleLines, orderMeta } = useMemo(() => {
    const lines: { date: string; productId: string; name: string; unit: string; qty: number; price: number }[] = []
    const meta: { date: string; completed: boolean }[] = []

    orders.forEach(order => {
      const st = order.status?.toLowerCase() || ""
      const completed = st.includes('complet') || st === 'selesai'
      const date = completed ? (order.completed_date || order.order_date) : order.order_date
      meta.push({ date, completed })
      if (!completed) return

      order.order_items?.forEach(item => {
        const p = Array.isArray(item.products) ? item.products[0] : item.products
        lines.push({
          date,
          productId: item.product_id,
          name: p?.name || 'Produk Custom',
          unit: p?.unit || 'Kg',
          qty: num(item.qty),
          price: num(p?.selling_price)
        })
      })
    })

    return { saleLines: lines, orderMeta: meta }
  }, [orders])

  const range = useMemo(
    () => getRange(periode, customStart, customEnd),
    [periode, customStart, customEnd]
  )
  const prevRange = useMemo(() => getPrevRange(periode, range), [periode, range])

  const statsFor = (r: DateRange) => {
    const perProductMap = new Map<string, { productId: string; name: string; unit: string; qty: number; revenue: number; price: number }>()
    saleLines.forEach(l => {
      if (l.date < r.start || l.date > r.end) return
      const row = perProductMap.get(l.productId) || {
        productId: l.productId, name: l.name, unit: l.unit, qty: 0, revenue: 0, price: l.price
      }
      row.qty += l.qty
      row.revenue += l.qty * l.price
      perProductMap.set(l.productId, row)
    })

    const perProduct = Array.from(perProductMap.values()).sort((a, b) => b.revenue - a.revenue)
    const totalRevenue = perProduct.reduce((s, p) => s + p.revenue, 0)
    const totalQty = perProduct.reduce((s, p) => s + p.qty, 0)

    const inRange = orderMeta.filter(o => o.date >= r.start && o.date <= r.end)
    const completedOrders = inRange.filter(o => o.completed).length
    const fulfilment = inRange.length > 0 ? (completedOrders / inRange.length) * 100 : 0

    return { perProduct, totalRevenue, totalQty, completedOrders, totalOrders: inRange.length, fulfilment }
  }

  const cur = useMemo(() => statsFor(range), [saleLines, orderMeta, range])
  const prev = useMemo(() => statsFor(prevRange), [saleLines, orderMeta, prevRange])

  const topProduct = cur.perProduct[0]
  const topShare = topProduct && cur.totalRevenue > 0 ? Math.round((topProduct.revenue / cur.totalRevenue) * 100) : 0

  // Data grafik tren omzet per bucket waktu
  const chartData = useMemo(() => {
    const buckets = buildBuckets(periode, range)
    const revenue = buckets.map(b => {
      let rev = 0
      saleLines.forEach(l => {
        if (l.date >= b.from && l.date <= b.to) rev += l.qty * l.price
      })
      return Math.round(rev)
    })
    return { labels: buckets.map(b => b.label), revenue }
  }, [periode, range, saleLines])

  const pieData = useMemo(() => ({
    labels: cur.perProduct.map(p => p.name),
    values: cur.perProduct.map(p => p.qty)
  }), [cur.perProduct])

  // =========================================================
  // EXPORT RINGKASAN (CSV)
  // =========================================================
  const handleExportCSV = () => {
    const rows = [
      'RINGKASAN KINERJA PENJUALAN - UMKM MIE KURNIA JAYA',
      `Periode,${csvEscape(PERIODE_LABEL[periode])}`,
      `Rentang Tanggal,${csvEscape(`${range.start} s/d ${range.end}`)}`,
      '',
      'Nama Produk,Jumlah Terjual,Satuan,Harga Satuan (Rp),Total Omzet (Rp)',
      ...cur.perProduct.map(p =>
        [csvEscape(p.name), p.qty, csvEscape(p.unit), Math.round(p.price), Math.round(p.revenue)].join(',')
      ),
      `${csvEscape('TOTAL')},${cur.totalQty},,,${Math.round(cur.totalRevenue)}`
    ]

    // BOM agar Excel membaca UTF-8 dengan benar
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "Ringkasan_Penjualan_Kurnia_Jaya.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  // =========================================================
  // CHART.JS: buat saat halaman siap, perbarui saat data berubah
  // =========================================================
  useEffect(() => {
    if (isLoading) return

    if (lineCanvasRef.current) {
      lineChartRef.current = new Chart(lineCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Omzet (Rp)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.15)', borderWidth: 3, fill: true, tension: 0.4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
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
        type: 'pie',
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
      lc.update()
    }

    const pc = pieChartRef.current
    if (pc) {
      pc.data.labels = pieData.labels
      pc.data.datasets[0].data = pieData.values
      pc.update()
    }
  }, [isLoading, chartData, chartType, pieData])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Memuat Ringkasan Penjualan...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header Beranda + Filter Periode */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 vision-glass p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <PieChart className="text-vision-cyan shrink-0" size={18} /> Dashboard Utama Beranda
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ringkasan performa penjualan dan kontribusi produk secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border">
            <span className="text-xs text-muted-foreground pl-2 font-medium">Periode:</span>
            <select
              value={periode}
              onChange={e => setPeriode(e.target.value as Periode)}
              className="bg-background text-foreground text-xs font-semibold px-3 py-1.5 rounded-xl border border-border focus:border-vision-cyan outline-none cursor-pointer"
            >
              <option value="hari">Hari Ini</option>
              <option value="minggu">Minggu Ini</option>
              <option value="bulan">Bulan Ini</option>
              <option value="tahun">Tahun Ini</option>
              <option value="custom">Custom (Pilih Tanggal)</option>
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
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-vision-emerald/20 text-vision-emerald border border-vision-emerald/30 hover:bg-vision-emerald/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Download size={14} /> Export Ringkasan
          </button>
        </div>
      </div>

      {loadError && (
        <div className="vision-glass p-4 rounded-2xl border border-vision-rose/40 text-xs text-vision-rose flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>Data pesanan gagal dimuat dari database: {loadError}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="vision-glass p-4 sm:p-5 rounded-2xl border-l-4 border-l-vision-cyan relative overflow-hidden">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Penjualan</span>
              <h3 className="text-xl sm:text-2xl font-black text-vision-cyan mt-1 truncate">{formatRp(cur.totalRevenue)}</h3>
            </div>
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-vision-cyan/20 text-vision-cyan flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>
          <TrendLine pct={pctChange(cur.totalRevenue, prev.totalRevenue)} suffix="dibanding periode sebelumnya" />
        </div>

        <div className="vision-glass p-4 sm:p-5 rounded-2xl border-l-4 border-l-vision-purple relative overflow-hidden">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Produk Terjual</span>
              <h3 className="text-xl sm:text-2xl font-black text-vision-purple mt-1 truncate">{cur.totalQty.toLocaleString('id-ID')} Qty</h3>
            </div>
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-vision-purple/20 text-vision-purple flex items-center justify-center">
              <PackageOpen size={20} />
            </div>
          </div>
          <TrendLine pct={pctChange(cur.totalQty, prev.totalQty)} suffix="volume penjualan" />
        </div>

        <div className="vision-glass p-4 sm:p-5 rounded-2xl border-l-4 border-l-vision-emerald relative overflow-hidden">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pesanan Selesai</span>
              <h3 className="text-xl sm:text-2xl font-black text-vision-emerald mt-1 truncate">{cur.completedOrders.toLocaleString('id-ID')} Transaksi</h3>
            </div>
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-vision-emerald/20 text-vision-emerald flex items-center justify-center">
              <Receipt size={20} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {cur.totalOrders > 0
              ? `Tingkat pemenuhan pesanan ${Math.round(cur.fulfilment)}%`
              : 'Belum ada pesanan pada periode ini'}
          </p>
        </div>

        <div className="vision-glass p-4 sm:p-5 rounded-2xl border-l-4 border-l-vision-amber relative overflow-hidden">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Produk Terlaris</span>
              <h3 className="text-lg font-black text-vision-amber mt-1 truncate">{topProduct ? topProduct.name : '-'}</h3>
            </div>
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-vision-amber/20 text-vision-amber flex items-center justify-center">
              <Crown size={20} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {topProduct ? `Menyumbang ${topShare}% dari total pendapatan` : 'Belum ada penjualan pada periode ini'}
          </p>
        </div>
      </div>

      {/* Grafik Tren vs Rincian Produk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="text-vision-cyan" size={18} /> Grafik Tren Penjualan Historis
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Pergerakan omzet berdasarkan periode yang dipilih.</p>
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

        <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <PieChart className="text-vision-cyan" size={18} /> Rincian Penjualan Produk
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Tabel performa & visualisasi kontribusi produk terjual.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse table-fixed min-w-[380px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-2.5 px-2 font-semibold text-left w-[36%]">Nama Produk</th>
                  <th className="pb-2.5 px-2 font-semibold text-center w-[20%]">Terjual</th>
                  <th className="pb-2.5 px-2 font-semibold text-right w-[26%]">Pendapatan</th>
                  <th className="pb-2.5 px-2 font-semibold text-center w-[18%]">Persen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {cur.perProduct.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground italic">
                      Belum ada pesanan selesai pada periode ini.
                    </td>
                  </tr>
                ) : (
                  cur.perProduct.map(p => {
                    const share = cur.totalRevenue > 0 ? Math.round((p.revenue / cur.totalRevenue) * 100) : 0
                    return (
                      <tr key={p.productId} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-2 font-bold text-left truncate">{p.name}</td>
                        <td className="py-2 px-2 text-vision-cyan font-extrabold text-center">
                          {p.qty.toLocaleString('id-ID')} {p.unit}
                        </td>
                        <td className="py-2 px-2 text-vision-emerald font-extrabold text-right">{formatRp(p.revenue)}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-vision-cyan/20 text-vision-cyan border border-vision-cyan/30 font-bold text-[10px]">
                            {share}%
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="h-[180px] w-full relative flex items-center justify-center">
            <canvas ref={pieCanvasRef}></canvas>
          </div>
        </div>
      </div>

    </div>
  )
}