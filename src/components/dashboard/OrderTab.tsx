'use client'

import { useState, useEffect, useMemo } from "react"
import { 
  ClipboardList, Plus, Loader2, 
  X, Send, ShoppingBag 
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

export default function OrdersTab() {
  const supabase = useMemo(() => createClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  
  // State Data
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  
  // Modal & Loading State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
  
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

  // Fungsi Update Status Pesanan (Otomatis potong stok FIFO saat 'completed')
  const handleUpdateStatus = async (
    order: Order,
    newStatus: 'pending' | 'processing' | 'completed'
  ) => {
    if (order.status === newStatus || updatingOrderId === order.id) return

    // Cegah pesanan yang sudah selesai dikembalikan ke status sebelumnya agar stok FIFO tidak rancu
    if (order.status === 'completed' && newStatus !== 'completed') {
      return alert("Pesanan yang sudah selesai (stok FIFO sudah terpotong) tidak dapat dikembalikan statusnya.")
    }

    setUpdatingOrderId(order.id)

    if (newStatus === 'completed') {
      const { error } = await supabase.rpc('complete_order_with_fifo', {
        p_order_id: order.id
      })

      setUpdatingOrderId(null)
      if (error) {
        alert(`Gagal menyelesaikan pesanan: ${error.message}`)
        return
      }
    } else {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id)

      setUpdatingOrderId(null)
      if (error) {
        alert(`Gagal mengubah status: ${error.message}`)
        return
      }
    }

    fetchData()
  }

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
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola pesanan masuk dan potong stok bahan baku secara FIFO saat pesanan selesai.
            </p>
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
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="text-vision-cyan" size={18} /> Daftar Transaksi Pesanan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Menekan tombol Selesai akan otomatis mengurangi batch bahan baku tertua (FIFO).
            </p>
          </div>
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
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                    Belum ada data pesanan pelanggan.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const item = order.order_items?.[0]
                  const isCompleted = order.status === 'completed'
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
                            type="button"
                            onClick={() => handleUpdateStatus(order, 'pending')}
                            disabled={isBusy || isCompleted || order.status === 'pending'}
                            className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-bold disabled:opacity-30"
                          >
                            Pending
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleUpdateStatus(order, 'processing')}
                            disabled={isBusy || isCompleted || order.status === 'processing'}
                            className="px-2 py-1 rounded bg-vision-blue/20 text-vision-blue hover:bg-vision-blue/30 text-[10px] font-bold disabled:opacity-30"
                          >
                            Proses
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleUpdateStatus(order, 'completed')}
                            disabled={isBusy || isCompleted}
                            className="px-2 py-1 rounded bg-vision-emerald/20 text-vision-emerald hover:bg-vision-emerald/30 text-[10px] font-bold disabled:opacity-30 inline-flex items-center gap-1"
                          >
                            {isBusy && <Loader2 size={10} className="animate-spin" />}
                            <span>Selesai</span>
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