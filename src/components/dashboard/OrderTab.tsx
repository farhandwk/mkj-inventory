'use client'

import { useState, useEffect, useMemo } from "react"
import { 
  ClipboardList, Plus, CheckCircle, Clock, Loader2, 
  X, Send, ShoppingBag, AlertCircle,
  Search, Download, FilterX, Columns3, CalendarDays
} from "lucide-react"
import { createClient } from "@/lib/supabase"

// --- Tipe Data ---
type Product = { id: string; name: string; unit: string }
type OrderItem = {
  id: string
  product_id: string
  qty: number
  products?: { name: string; unit: string }
}
type Order = {
  id: string
  customer_name: string
  order_date: string
  deadline_date: string
  status: 'pending' | 'processing' | 'completed'
  order_items?: OrderItem[]
}

// --- Tipe & Default Filter ---
type Filters = {
  search: string
  status: 'all' | 'pending' | 'processing' | 'completed'
  product_id: string
  order_from: string
  order_to: string
  deadline_from: string
  deadline_to: string
  deadline_quick: 'all' | 'overdue' | 'today' | 'next7'
  sort: 'order_desc' | 'order_asc' | 'deadline_asc' | 'deadline_desc' | 'qty_desc' | 'qty_asc' | 'customer_asc'
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: 'all',
  product_id: 'all',
  order_from: "",
  order_to: "",
  deadline_from: "",
  deadline_to: "",
  deadline_quick: 'all',
  sort: 'order_desc'
}

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Pending',
  processing: 'Proses',
  completed: 'Selesai'
}

// --- Helper tanggal (format YYYY-MM-DD) ---
const todayStr = () => new Date().toISOString().split('T')[0]

const diffDaysFromToday = (dateStr: string) => {
  const target = new Date(`${dateStr}T00:00:00`).getTime()
  const today = new Date(`${todayStr()}T00:00:00`).getTime()
  return Math.round((target - today) / 86400000)
}

export default function OrdersTab() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  
  // State Data
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter & Export State
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [isExporting, setIsExporting] = useState(false)
  
  // Form State
  const [formOrder, setFormOrder] = useState({
    customer_name: "",
    order_date: new Date().toISOString().split('T')[0],
    deadline_date: "",
    product_id: "",
    qty: ""
  })

  // Fetch Data Orders & Products
  const fetchData = async () => {
    setIsLoading(true)
    const [prodRes, orderRes] = await Promise.all([
      supabase.from('products').select('id, name, unit'),
      supabase.from('orders').select(`
        *,
        order_items (
          id,
          product_id,
          qty,
          products (name, unit)
        )
      `).order('order_date', { ascending: false })
    ])

    if (prodRes.data) setProducts(prodRes.data)
    if (orderRes.data) setOrders(orderRes.data as Order[])
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Fungsi Tambah Pesanan Baru
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formOrder.customer_name || !formOrder.product_id || !formOrder.qty || !formOrder.deadline_date) {
      return alert("Semua field wajib diisi!")
    }

    setIsSubmitting(true)

    // 1. Insert ke tabel orders
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: formOrder.customer_name,
        order_date: formOrder.order_date,
        deadline_date: formOrder.deadline_date,
        status: 'pending'
      })
      .select()
      .single()

    if (orderError || !newOrder) {
      alert(`Gagal membuat pesanan: ${orderError?.message}`)
      setIsSubmitting(false)
      return
    }

    // 2. Insert ke tabel order_items
    const { error: itemError } = await supabase
      .from('order_items')
      .insert({
        order_id: newOrder.id,
        product_id: formOrder.product_id,
        qty: parseFloat(formOrder.qty)
      })

    setIsSubmitting(false)
    if (itemError) {
      alert(`Gagal menyimpan item pesanan: ${itemError.message}`)
    } else {
      setIsModalOpen(false)
      setFormOrder({
        customer_name: "",
        order_date: new Date().toISOString().split('T')[0],
        deadline_date: "",
        product_id: "",
        qty: ""
      })
      fetchData()
    }
  }

  // Fungsi Update Status Pesanan
  const handleUpdateStatus = async (orderId: string, newStatus: 'pending' | 'processing' | 'completed') => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      alert(`Gagal mengubah status: ${error.message}`)
    } else {
      fetchData()
    }
  }

  // --- Filter & Sort ---
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const resetFilters = () => setFilters(DEFAULT_FILTERS)

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.search.trim()) count++
    if (filters.status !== 'all') count++
    if (filters.product_id !== 'all') count++
    if (filters.order_from || filters.order_to) count++
    if (filters.deadline_from || filters.deadline_to) count++
    if (filters.deadline_quick !== 'all') count++
    if (filters.sort !== 'order_desc') count++
    return count
  }, [filters])

  const filteredOrders = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase()
    const today = todayStr()

    const result = orders.filter(order => {
      const item = order.order_items?.[0]

      // Pencarian: nama pelanggan atau nama produk
      if (keyword) {
        const customer = order.customer_name?.toLowerCase() || ""
        const productName = item?.products?.name?.toLowerCase() || ""
        if (!customer.includes(keyword) && !productName.includes(keyword)) return false
      }

      // Status
      if (filters.status !== 'all' && order.status !== filters.status) return false

      // Produk
      if (filters.product_id !== 'all' && item?.product_id !== filters.product_id) return false

      // Rentang tanggal pesan
      if (filters.order_from && order.order_date < filters.order_from) return false
      if (filters.order_to && order.order_date > filters.order_to) return false

      // Rentang deadline
      if (filters.deadline_from && order.deadline_date < filters.deadline_from) return false
      if (filters.deadline_to && order.deadline_date > filters.deadline_to) return false

      // Filter cepat deadline (hanya untuk pesanan yang belum selesai)
      if (filters.deadline_quick !== 'all') {
        if (order.status === 'completed') return false
        const diff = diffDaysFromToday(order.deadline_date)
        if (filters.deadline_quick === 'overdue' && !(order.deadline_date < today)) return false
        if (filters.deadline_quick === 'today' && diff !== 0) return false
        if (filters.deadline_quick === 'next7' && !(diff >= 0 && diff <= 7)) return false
      }

      return true
    })

    const qtyOf = (o: Order) => o.order_items?.[0]?.qty ?? 0
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'order_asc': return a.order_date.localeCompare(b.order_date)
        case 'deadline_asc': return a.deadline_date.localeCompare(b.deadline_date)
        case 'deadline_desc': return b.deadline_date.localeCompare(a.deadline_date)
        case 'qty_desc': return qtyOf(b) - qtyOf(a)
        case 'qty_asc': return qtyOf(a) - qtyOf(b)
        case 'customer_asc': return a.customer_name.localeCompare(b.customer_name)
        case 'order_desc':
        default: return b.order_date.localeCompare(a.order_date)
      }
    })

    return result
  }, [orders, filters])

  // --- Export Excel (mengikuti hasil filter) ---
  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) {
      return alert("Tidak ada data untuk diekspor.")
    }

    setIsExporting(true)
    try {
      const XLSX = await import('xlsx')

      const rows = filteredOrders.map((order, idx) => {
        const item = order.order_items?.[0]
        return {
          "No": idx + 1,
          "Pelanggan": order.customer_name,
          "Tanggal Pesan": order.order_date,
          "Deadline": order.deadline_date,
          "Produk": item?.products?.name || 'Produk Custom',
          "Jumlah": item?.qty ?? 0,
          "Satuan": item?.products?.unit || 'Kg',
          "Status": STATUS_LABEL[order.status]
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [
        { wch: 5 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
        { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 12 }
      ]
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Pesanan")
      XLSX.writeFile(workbook, `Daftar_Pesanan_${todayStr()}.xlsx`)
    } catch (err: any) {
      alert(`Gagal mengekspor Excel: ${err?.message || err}`)
    } finally {
      setIsExporting(false)
    }
  }

  // --- Konfigurasi Kanban ---
  const kanbanColumns: {
    key: Order['status']
    label: string
    headerClass: string
    countClass: string
    icon: React.ReactNode
  }[] = [
    {
      key: 'pending',
      label: 'Pending',
      headerClass: 'text-vision-amber border-vision-amber/30',
      countClass: 'bg-vision-amber/15 text-vision-amber border-vision-amber/30',
      icon: <Clock size={14} />
    },
    {
      key: 'processing',
      label: 'Diproses',
      headerClass: 'text-vision-blue border-vision-blue/30',
      countClass: 'bg-vision-blue/15 text-vision-blue border-vision-blue/30',
      icon: <Loader2 size={14} />
    },
    {
      key: 'completed',
      label: 'Selesai',
      headerClass: 'text-vision-emerald border-vision-emerald/30',
      countClass: 'bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30',
      icon: <CheckCircle size={14} />
    }
  ]

  const getDeadlineInfo = (order: Order) => {
    if (order.status === 'completed') return null
    const diff = diffDaysFromToday(order.deadline_date)
    if (diff < 0) return { text: `Terlambat ${Math.abs(diff)} hari`, className: 'bg-vision-rose/15 text-vision-rose border-vision-rose/30' }
    if (diff === 0) return { text: 'Deadline hari ini', className: 'bg-vision-amber/15 text-vision-amber border-vision-amber/30' }
    if (diff <= 3) return { text: `H-${diff}`, className: 'bg-vision-amber/15 text-vision-amber border-vision-amber/30' }
    return null
  }

  const filterInputClass = "w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:border-vision-cyan outline-none"

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Memuat Data Pesanan Pelanggan...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER */}
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white text-2xl shadow-glow-cyan">
            <ClipboardList size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">Modul Order Pelanggan</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Kelola pesanan masuk, tenggat waktu, dan alur status pengerjaan produk.</p>
          </div>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-bold text-xs transition-all flex items-center gap-2 shadow-glow-cyan hover:opacity-90"
        >
          <Plus size={16} />
          <span>+ Buat Pesanan Baru</span>
        </button>
      </div>

      {/* TABEL DAFTAR PESANAN */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="text-vision-cyan" size={18} /> Daftar Transaksi Pesanan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Ubah status pesanan untuk melacak progres operasional harian.</p>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || filteredOrders.length === 0}
            className="px-4 py-2.5 rounded-xl bg-vision-emerald/20 text-vision-emerald hover:bg-vision-emerald/30 font-bold text-xs transition-all flex items-center gap-2 disabled:opacity-40 self-start sm:self-auto"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export Excel ({filteredOrders.length})</span>
          </button>
        </div>

        {/* PANEL FILTER */}
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5 lg:col-span-2">
              <label className="font-semibold text-foreground">Cari Pelanggan / Produk</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Ketik nama pelanggan atau produk..."
                  value={filters.search}
                  onChange={e => updateFilter('search', e.target.value)}
                  className={`${filterInputClass} pl-9`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Status</label>
              <select
                value={filters.status}
                onChange={e => updateFilter('status', e.target.value as Filters['status'])}
                className={filterInputClass}
              >
                <option value="all">Semua Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Proses</option>
                <option value="completed">Selesai</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Produk</label>
              <select
                value={filters.product_id}
                onChange={e => updateFilter('product_id', e.target.value)}
                className={filterInputClass}
              >
                <option value="all">Semua Produk</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Tanggal Pesan (Dari)</label>
              <input
                type="date"
                value={filters.order_from}
                onChange={e => updateFilter('order_from', e.target.value)}
                className={filterInputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Tanggal Pesan (Sampai)</label>
              <input
                type="date"
                value={filters.order_to}
                onChange={e => updateFilter('order_to', e.target.value)}
                className={filterInputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Deadline (Dari)</label>
              <input
                type="date"
                value={filters.deadline_from}
                onChange={e => updateFilter('deadline_from', e.target.value)}
                className={filterInputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Deadline (Sampai)</label>
              <input
                type="date"
                value={filters.deadline_to}
                onChange={e => updateFilter('deadline_to', e.target.value)}
                className={filterInputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Status Deadline</label>
              <select
                value={filters.deadline_quick}
                onChange={e => updateFilter('deadline_quick', e.target.value as Filters['deadline_quick'])}
                className={filterInputClass}
              >
                <option value="all">Semua</option>
                <option value="overdue">Terlambat (belum selesai)</option>
                <option value="today">Deadline hari ini</option>
                <option value="next7">Deadline 7 hari ke depan</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Urutkan</label>
              <select
                value={filters.sort}
                onChange={e => updateFilter('sort', e.target.value as Filters['sort'])}
                className={filterInputClass}
              >
                <option value="order_desc">Tanggal pesan terbaru</option>
                <option value="order_asc">Tanggal pesan terlama</option>
                <option value="deadline_asc">Deadline terdekat</option>
                <option value="deadline_desc">Deadline terjauh</option>
                <option value="qty_desc">Jumlah terbesar</option>
                <option value="qty_asc">Jumlah terkecil</option>
                <option value="customer_asc">Pelanggan (A-Z)</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
                className="w-full px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <FilterX size={14} />
                Reset Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>
          </div>

          <p className="text-muted-foreground">
            Menampilkan <span className="font-bold text-foreground">{filteredOrders.length}</span> dari{' '}
            <span className="font-bold text-foreground">{orders.length}</span> pesanan
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
              <tr>
                <th className="pb-3 px-3 font-semibold text-left">Pelanggan</th>
                <th className="pb-3 px-3 font-semibold text-left">Tgl Pesan / Deadline</th>
                <th className="pb-3 px-3 font-semibold text-left">Produk Dipesan</th>
                <th className="pb-3 px-3 font-semibold text-center">Jumlah</th>
                <th className="pb-3 px-3 font-semibold text-center">Status Alur</th>
                <th className="pb-3 px-3 font-semibold text-center">Aksi Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-foreground">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                    {orders.length === 0
                      ? 'Belum ada data pesanan pelanggan.'
                      : 'Tidak ada pesanan yang cocok dengan filter.'}
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const item = order.order_items?.[0]
                  
                  let badgeColor = "bg-vision-amber/15 text-vision-amber border-vision-amber/30"
                  if (order.status === 'processing') badgeColor = "bg-vision-blue/15 text-vision-blue border-vision-blue/30"
                  if (order.status === 'completed') badgeColor = "bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30"

                  return (
                    <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 font-bold text-left">{order.customer_name}</td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[10px] text-muted-foreground">{order.order_date}</div>
                        <div className="font-semibold text-vision-rose text-[11px]">Due: {order.deadline_date}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold">{item?.products?.name || 'Produk Custom'}</td>
                      <td className="py-3 px-3 font-extrabold text-vision-cyan text-center">
                        {item?.qty.toLocaleString('id-ID')} {item?.products?.unit || 'Kg'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${badgeColor}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleUpdateStatus(order.id, 'pending')}
                            disabled={order.status === 'pending'}
                            className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-bold disabled:opacity-30"
                          >
                            Pending
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(order.id, 'processing')}
                            disabled={order.status === 'processing'}
                            className="px-2 py-1 rounded bg-vision-blue/20 text-vision-blue hover:bg-vision-blue/30 text-[10px] font-bold disabled:opacity-30"
                          >
                            Proses
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(order.id, 'completed')}
                            disabled={order.status === 'completed'}
                            className="px-2 py-1 rounded bg-vision-emerald/20 text-vision-emerald hover:bg-vision-emerald/30 text-[10px] font-bold disabled:opacity-30"
                          >
                            Selesai
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================= */}
      {/* KANBAN BOARD PESANAN */}
      {/* ========================================= */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
        <div className="border-b border-border pb-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Columns3 className="text-vision-cyan" size={18} /> Kanban Board Pesanan
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Pesanan dikelompokkan berdasarkan status pengerjaan (mengikuti filter di atas).</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {kanbanColumns.map(col => {
            const colOrders = filteredOrders.filter(o => o.status === col.key)

            return (
              <div key={col.key} className="rounded-2xl bg-muted/20 border border-border/50 p-3 flex flex-col gap-3">
                <div className={`flex items-center justify-between pb-2 border-b ${col.headerClass}`}>
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider">
                    {col.icon}
                    <span>{col.label}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${col.countClass}`}>
                    {colOrders.length}
                  </span>
                </div>

                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {colOrders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground italic">
                      Tidak ada pesanan.
                    </div>
                  ) : (
                    colOrders.map(order => {
                      const item = order.order_items?.[0]
                      const deadlineInfo = getDeadlineInfo(order)

                      return (
                        <div
                          key={order.id}
                          className="vision-glass p-4 rounded-2xl border border-border/50 space-y-3 hover:border-vision-cyan/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-bold text-foreground leading-tight">{order.customer_name}</h4>
                            {deadlineInfo && (
                              <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase flex items-center gap-1 ${deadlineInfo.className}`}>
                                <AlertCircle size={10} />
                                {deadlineInfo.text}
                              </span>
                            )}
                          </div>

                          <div className="text-xs space-y-1">
                            <div className="font-semibold text-foreground">{item?.products?.name || 'Produk Custom'}</div>
                            <div className="font-extrabold text-vision-cyan">
                              {item?.qty.toLocaleString('id-ID')} {item?.products?.unit || 'Kg'}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border/50 text-[10px] space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                              <CalendarDays size={11} /> Pesan: {order.order_date}
                            </div>
                            <div className="flex items-center gap-1.5 font-semibold text-vision-rose">
                              <Clock size={11} /> Due: {order.deadline_date}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ========================================= */}
      {/* MODAL BUAT PESANAN BARU */}
      {/* ========================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="vision-glass w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/50 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vision-cyan/20 text-vision-cyan flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Form Pesanan Pelanggan Baru</h3>
                  <p className="text-xs text-muted-foreground">Catat pesanan produk jadi dan tentukan tenggat waktunya.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Nama Pelanggan / Toko</label>
                <input 
                  type="text" required placeholder="Contoh: Toko Berkah Jaya"
                  value={formOrder.customer_name}
                  onChange={e => setFormOrder({...formOrder, customer_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Tanggal Pesan</label>
                  <input 
                    type="date" required 
                    value={formOrder.order_date}
                    onChange={e => setFormOrder({...formOrder, order_date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Deadline (Tenggat Waktu)</label>
                  <input 
                    type="date" required 
                    value={formOrder.deadline_date}
                    onChange={e => setFormOrder({...formOrder, deadline_date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Produk Jadi</label>
                <select 
                  required 
                  value={formOrder.product_id}
                  onChange={e => setFormOrder({...formOrder, product_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value="" disabled>-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Jumlah Pesanan</label>
                <input 
                  type="number" required min="1" step="0.01" placeholder="Contoh: 50"
                  value={formOrder.qty}
                  onChange={e => setFormOrder({...formOrder, qty: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none" 
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold">
                  Batal
                </button>
                <button disabled={isSubmitting} type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
                  Simpan Pesanan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}