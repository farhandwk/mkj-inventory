'use client'

import { useState, useEffect, useMemo } from "react"
import {
  ClipboardList, Plus, Loader2, X, Send, ShoppingBag,
  Columns3, Pencil, Trash2, CheckCircle2, ArrowRight
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import ServerPagination from "@/components/ui/ServerPagination"

type OrderStatus = 'pending' | 'processing' | 'completed'

type Product = {
  id: string
  name: string
  unit: string
  selling_price?: number | null
}

type OrderItem = {
  id: string
  order_id: string
  product_id: string
  qty: number
  products?:
    | { name: string; unit: string; selling_price?: number | null }
    | { name: string; unit: string; selling_price?: number | null }[]
    | null
}

type Order = {
  id: string
  customer_name: string
  order_date: string
  deadline_date: string
  status: OrderStatus
  order_items?: OrderItem[]
}

const PAGE_SIZE = 10
const KANBAN_CARD_LIMIT = 6

function getItemProduct(item?: OrderItem) {
  if (!item?.products) return { name: 'Produk', unit: 'Kg', sellingPrice: 0 }
  const p = Array.isArray(item.products) ? item.products[0] : item.products
  return {
    name: p?.name || 'Produk',
    unit: p?.unit || 'Kg',
    sellingPrice: Number(p?.selling_price ?? 0),
  }
}

export default function OrdersTab() {
  const supabase = useMemo(() => createClient(), [])
  const [isLoading, setIsLoading] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [kanbanOrders, setKanbanOrders] = useState<Order[]>([])

  // Server-side pagination untuk Daftar Transaksi Pelanggan
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Modal Create State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formOrder, setFormOrder] = useState({
    customer_name: "",
    order_date: new Date().toISOString().split('T')[0],
    deadline_date: "",
    product_id: "",
    qty: ""
  })

  // Modal Edit State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editForm, setEditForm] = useState({
    customer_name: "",
    order_date: "",
    deadline_date: "",
    product_id: "",
    qty: "",
    status: "pending" as OrderStatus,
  })
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, unit, selling_price')
      .order('name')
    if (data) setProducts(data as Product[])
  }

  const fetchOrdersPage = async (targetPage = page) => {
    setIsLoading(true)
    const from = (targetPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const [pagedRes, boardRes] = await Promise.all([
      supabase
        .from('orders')
        .select(`
          id, customer_name, order_date, deadline_date, status,
          order_items (
            id, order_id, product_id, qty,
            products (name, unit, selling_price)
          )
        `, { count: 'exact' })
        .order('order_date', { ascending: false })
        .range(from, to),
      supabase
        .from('orders')
        .select(`
          id, customer_name, order_date, deadline_date, status,
          order_items (
            id, order_id, product_id, qty,
            products (name, unit, selling_price)
          )
        `)
        .order('deadline_date', { ascending: true })
    ])

    if (pagedRes.error) {
      alert(`Gagal memuat daftar transaksi: ${pagedRes.error.message}`)
    } else {
      setOrders((pagedRes.data || []) as Order[])
      setTotalCount(pagedRes.count || 0)
    }

    if (!boardRes.error && boardRes.data) {
      setKanbanOrders(boardRes.data as Order[])
    }

    setIsLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [supabase])

  useEffect(() => {
    fetchOrdersPage(page)
  }, [page])

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formOrder.customer_name || !formOrder.product_id || !formOrder.qty || !formOrder.deadline_date) {
      return alert("Semua field wajib diisi!")
    }

    setIsSubmitting(true)
    setFeedback(null)

    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: formOrder.customer_name.trim(),
        order_date: formOrder.order_date,
        deadline_date: formOrder.deadline_date,
        status: 'pending'
      })
      .select()
      .single()

    if (orderError || !newOrder) {
      setIsSubmitting(false)
      return alert(`Gagal membuat pesanan: ${orderError?.message}`)
    }

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
      setFeedback("Pesanan baru berhasil ditambahkan.")
      if (page !== 1) setPage(1)
      else fetchOrdersPage(1)
    }
  }

  const handleUpdateStatus = async (order: Order, newStatus: OrderStatus) => {
    if (order.status === newStatus || updatingOrderId === order.id) return

    setUpdatingOrderId(order.id)
    setFeedback(null)

    const { error } = await supabase.rpc('set_order_status_with_fifo', {
      p_order_id: order.id,
      p_new_status: newStatus,
    })

    setUpdatingOrderId(null)
    if (error) {
      alert(`Gagal mengubah status pesanan: ${error.message}`)
      return
    }

    setFeedback(
      newStatus === 'completed'
        ? `Pesanan ${order.customer_name} selesai; stok bahan baku dipotong FIFO.`
        : order.status === 'completed'
        ? `Status pesanan ${order.customer_name} diubah; pemotongan FIFO di-rollback.`
        : `Status pesanan ${order.customer_name} diubah menjadi ${newStatus}.`
    )
    fetchOrdersPage(page)
  }

  const openEditModal = (order: Order) => {
    const firstItem = order.order_items?.[0]
    setEditingOrder(order)
    setEditForm({
      customer_name: order.customer_name,
      order_date: order.order_date,
      deadline_date: order.deadline_date,
      product_id: firstItem?.product_id || products[0]?.id || "",
      qty: firstItem ? String(firstItem.qty) : "1",
      status: order.status,
    })
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrder) return

    setIsSavingEdit(true)
    setFeedback(null)

    const { error } = await supabase.rpc('update_order_with_fifo', {
      p_order_id: editingOrder.id,
      p_customer_name: editForm.customer_name,
      p_order_date: editForm.order_date,
      p_deadline_date: editForm.deadline_date,
      p_product_id: editForm.product_id,
      p_qty: parseFloat(editForm.qty),
      p_status: editForm.status,
    })

    setIsSavingEdit(false)

    if (error) {
      alert(`Gagal memperbarui pesanan: ${error.message}`)
    } else {
      setEditingOrder(null)
      setFeedback("Riwayat transaksi diperbarui dan stok FIFO disesuaikan otomatis.")
      fetchOrdersPage(page)
    }
  }

  const handleDeleteOrder = async (order: Order) => {
    const ok = window.confirm(
      `Hapus pesanan dari "${order.customer_name}"? Jika sudah berstatus completed, pemotongan FIFO akan otomatis dikembalikan.`
    )
    if (!ok) return

    setUpdatingOrderId(order.id)
    setFeedback(null)

    const { error } = await supabase.rpc('delete_order_with_fifo', {
      p_order_id: order.id,
    })

    setUpdatingOrderId(null)

    if (error) {
      alert(`Gagal menghapus pesanan: ${error.message}`)
    } else {
      setFeedback(`Pesanan "${order.customer_name}" dihapus dan stok FIFO disinkronkan.`)
      fetchOrdersPage(page)
    }
  }

  const kanbanColumns: {
    status: OrderStatus
    title: string
    subtitle: string
    accentClass: string
    badgeClass: string
  }[] = [
    {
      status: 'pending',
      title: 'Pending',
      subtitle: 'Menunggu antrean produksi',
      accentClass: 'border-vision-amber/40',
      badgeClass: 'bg-vision-amber/15 text-vision-amber border-vision-amber/30',
    },
    {
      status: 'processing',
      title: 'Proses',
      subtitle: 'Sedang diproduksi di dapur/pabrik',
      accentClass: 'border-vision-blue/40',
      badgeClass: 'bg-vision-blue/15 text-vision-blue border-vision-blue/30',
    },
    {
      status: 'completed',
      title: 'Selesai',
      subtitle: 'Selesai & terpotong FIFO',
      accentClass: 'border-vision-emerald/40',
      badgeClass: 'bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30',
    },
  ]

  if (isLoading && orders.length === 0) {
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
            <p className="text-xs text-muted-foreground mt-0.5">
              Pantau alur produksi lewat Kanban Board, kelola riwayat transaksi, dan sinkronisasi FIFO otomatis.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {feedback && (
            <div className="px-3.5 py-2 rounded-xl bg-vision-emerald/15 border border-vision-emerald/30 text-vision-emerald text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{feedback}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-bold text-xs transition-all flex items-center gap-2 shadow-glow-cyan hover:opacity-90"
          >
            <Plus size={16} />
            <span>+ Buat Pesanan Baru</span>
          </button>
        </div>
      </div>

      {/* 1. KANBAN BOARD PESANAN */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Columns3 className="text-vision-cyan" size={18} /> Kanban Board Pesanan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Menampilkan hingga {KANBAN_CARD_LIMIT} antrean prioritas per kolom (deadline terdekat) dengan scroll vertikal terbatas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {kanbanColumns.map(col => {
            const allColOrders = kanbanOrders.filter(o => o.status === col.status)
            const colOrders = allColOrders.slice(0, KANBAN_CARD_LIMIT)
            const hiddenCount = Math.max(0, allColOrders.length - colOrders.length)
            const totalQtyCol = allColOrders.reduce(
              (acc, ord) => acc + Number(ord.order_items?.[0]?.qty ?? 0),
              0
            )
            const nextStatus: OrderStatus | null =
              col.status === 'pending'
                ? 'processing'
                : col.status === 'processing'
                ? 'completed'
                : null

            return (
              <div
                key={col.status}
                className={`rounded-2xl bg-background/45 border ${col.accentClass} p-4 flex flex-col gap-3`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold uppercase ${col.badgeClass}`}>
                        {col.title}
                      </span>
                      <span className="text-xs font-extrabold text-foreground">
                        {allColOrders.length} Pesanan
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{col.subtitle}</p>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-vision-cyan">
                    {totalQtyCol.toLocaleString('id-ID')} unit
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {colOrders.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-xl">
                      Kosong
                    </div>
                  ) : (
                    colOrders.map(ord => {
                      const item = ord.order_items?.[0]
                      const prod = getItemProduct(item)
                      const isBusy = updatingOrderId === ord.id

                      return (
                        <div
                          key={ord.id}
                          className="p-3.5 rounded-xl bg-background/80 border border-border/70 hover:border-vision-cyan/50 transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-xs text-foreground">{ord.customer_name}</p>
                            <span className="font-mono text-[10px] font-semibold text-vision-rose shrink-0">
                              Due: {ord.deadline_date}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground font-medium truncate">{prod.name}</span>
                            <span className="font-extrabold text-vision-cyan shrink-0 ml-2">
                              {Number(item?.qty ?? 0).toLocaleString('id-ID')} {prod.unit}
                            </span>
                          </div>

                          <div className="pt-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              Tgl: {ord.order_date}
                            </span>

                            {nextStatus && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleUpdateStatus(ord, nextStatus)}
                                className="px-2.5 py-1 rounded-lg bg-vision-cyan/15 hover:bg-vision-cyan/25 text-vision-cyan font-bold text-[10px] inline-flex items-center gap-1 disabled:opacity-40"
                              >
                                {isBusy ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <>
                                    <span>{nextStatus === 'processing' ? 'Proses' : 'Selesai'}</span>
                                    <ArrowRight size={11} />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}

                  {hiddenCount > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{hiddenCount} pesanan lainnya (lihat seluruh riwayat di tabel transaksi di bawah)
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. DAFTAR TRANSAKSI PELANGGAN */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="text-vision-cyan" size={18} /> Daftar Transaksi Pelanggan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola seluruh riwayat transaksi; perubahan atau penghapusan pesanan selesai otomatis menyinkronkan stok FIFO.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-vision-cyan text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Memuat halaman transaksi...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[980px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Pelanggan</th>
                  <th className="pb-3 px-3 font-semibold text-left">Tgl Pesan / Deadline</th>
                  <th className="pb-3 px-3 font-semibold text-left">Produk Dipesan</th>
                  <th className="pb-3 px-3 font-semibold text-center">Jumlah</th>
                  <th className="pb-3 px-3 font-semibold text-center">Status Alur</th>
                  <th className="pb-3 px-3 font-semibold text-center">Aksi / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                      Belum ada data pesanan pelanggan.
                    </td>
                  </tr>
                ) : (
                  orders.map(order => {
                    const item = order.order_items?.[0]
                    const prod = getItemProduct(item)
                    const isBusy = updatingOrderId === order.id

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
                        <td className="py-3 px-3 font-semibold">{prod.name}</td>
                        <td className="py-3 px-3 font-extrabold text-vision-cyan text-center">
                          {Number(item?.qty ?? 0).toLocaleString('id-ID')} {prod.unit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${badgeColor}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order, 'pending')}
                              disabled={isBusy || order.status === 'pending'}
                              className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-bold disabled:opacity-30"
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order, 'processing')}
                              disabled={isBusy || order.status === 'processing'}
                              className="px-2 py-1 rounded bg-vision-blue/20 text-vision-blue hover:bg-vision-blue/30 text-[10px] font-bold disabled:opacity-30"
                            >
                              Proses
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order, 'completed')}
                              disabled={isBusy || order.status === 'completed'}
                              className="px-2 py-1 rounded bg-vision-emerald/20 text-vision-emerald hover:bg-vision-emerald/30 text-[10px] font-bold disabled:opacity-30 inline-flex items-center gap-1"
                            >
                              {isBusy && <Loader2 size={10} className="animate-spin" />}
                              <span>Selesai</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openEditModal(order)}
                              className="px-2 py-1 rounded-lg bg-vision-blue/15 border border-vision-blue/30 text-vision-blue hover:bg-vision-blue/25 text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-30"
                            >
                              <Pencil size={11} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteOrder(order)}
                              className="px-2 py-1 rounded-lg bg-vision-rose/15 border border-vision-rose/30 text-vision-rose hover:bg-vision-rose/25 text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-30"
                            >
                              <Trash2 size={11} />
                              <span>Hapus</span>
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
        )}

        <ServerPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>

      {/* MODAL BUAT PESANAN BARU */}
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
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Nama Pelanggan / Toko</label>
                <input
                  type="text" required placeholder="Contoh: Toko Berkah Jaya"
                  value={formOrder.customer_name}
                  onChange={e => setFormOrder({ ...formOrder, customer_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Tanggal Pesan</label>
                  <input
                    type="date" required
                    value={formOrder.order_date}
                    onChange={e => setFormOrder({ ...formOrder, order_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Deadline (Tenggat Waktu)</label>
                  <input
                    type="date" required
                    value={formOrder.deadline_date}
                    onChange={e => setFormOrder({ ...formOrder, deadline_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Produk Jadi</label>
                <select
                  required
                  value={formOrder.product_id}
                  onChange={e => setFormOrder({ ...formOrder, product_id: e.target.value })}
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
                  type="number" required min="0.01" step="0.01" placeholder="Contoh: 50"
                  value={formOrder.qty}
                  onChange={e => setFormOrder({ ...formOrder, qty: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold">
                  Batal
                </button>
                <button disabled={isSubmitting} type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Simpan Pesanan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT RIWAYAT TRANSAKSI PESANAN */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="vision-glass w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/50 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vision-blue/20 text-vision-blue flex items-center justify-center">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Edit Riwayat Transaksi</h3>
                  <p className="text-xs text-muted-foreground">
                    Perubahan qty, produk, atau status akan menyinkronkan FIFO secara otomatis.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setEditingOrder(null)} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Nama Pelanggan / Toko</label>
                <input
                  type="text" required
                  value={editForm.customer_name}
                  onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Tanggal Pesan</label>
                  <input
                    type="date" required
                    value={editForm.order_date}
                    onChange={e => setEditForm({ ...editForm, order_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Deadline</label>
                  <input
                    type="date" required
                    value={editForm.deadline_date}
                    onChange={e => setEditForm({ ...editForm, deadline_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Produk Jadi</label>
                  <select
                    required
                    value={editForm.product_id}
                    onChange={e => setEditForm({ ...editForm, product_id: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Jumlah</label>
                  <input
                    type="number" required min="0.01" step="0.01"
                    value={editForm.qty}
                    onChange={e => setEditForm({ ...editForm, qty: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Status Alur</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as OrderStatus })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value="pending">pending</option>
                  <option value="processing">processing</option>
                  <option value="completed">completed</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setEditingOrder(null)} className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold">
                  Batal
                </button>
                <button type="submit" disabled={isSavingEdit} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50">
                  {isSavingEdit ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}