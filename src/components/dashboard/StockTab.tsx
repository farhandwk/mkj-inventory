'use client'

import { useState, useEffect } from "react"
import { 
  Boxes, ShoppingCart, CircleCheck, TriangleAlert, 
  CircleX, TrendingUp, Clock, FileDown, X, Loader2, Send
} from "lucide-react"
import { createClient } from "@/lib/supabase"

// --- Tipe Data ---
type Material = {
  id: string
  name: string
  monitoring_unit: string
  safety_stock: number
  reorder_point: number
  price_per_unit: number
}

type Batch = {
  id: string
  material_id: string
  qty: number
  arrival_date: string
  supplier: string
  created_at: string
}

export default function StockTab() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  
  // Data State
  const [materials, setMaterials] = useState<Material[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formStock, setFormStock] = useState({
    material_id: "",
    qty: "",
    arrival_date: new Date().toISOString().split('T')[0],
    supplier: ""
  })

  // Fetch Data
  const fetchData = async () => {
    setIsLoading(true)
    const [matRes, batchRes] = await Promise.all([
      supabase.from('materials').select('*').order('created_at'),
      supabase.from('inventory_batches').select('*').order('created_at', { ascending: false })
    ])

    if (matRes.data) setMaterials(matRes.data)
    if (batchRes.data) setBatches(batchRes.data)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Fungsi Submit Pesanan Stok
  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formStock.material_id || !formStock.qty) return alert("Pilih bahan baku dan isi jumlah!")
    
    setIsSubmitting(true)
    const { error } = await supabase.from('inventory_batches').insert({
      material_id: formStock.material_id,
      qty: parseFloat(formStock.qty),
      arrival_date: formStock.arrival_date,
      supplier: formStock.supplier
    })

    setIsSubmitting(false)
    if (error) {
      alert(`Gagal menyimpan: ${error.message}`)
    } else {
      alert("Pesanan Stok Berhasil Dicatat!")
      setIsModalOpen(false)
      setFormStock({ ...formStock, qty: "", supplier: "" })
      fetchData() // Refresh EWS
    }
  }

  // Kalkulasi EWS (Early Warning System)
  const ewsData = materials.map(mat => {
    const matBatches = batches.filter(b => b.material_id === mat.id)
    const currentStock = matBatches.reduce((sum, b) => sum + b.qty, 0)
    
    let status = "Aman"
    let statusColor = "text-vision-emerald bg-vision-emerald/20 border-vision-emerald/30"
    let Icon = CircleCheck

    if (currentStock <= mat.safety_stock) {
      status = "Kritis (<= SS)"
      statusColor = "text-vision-rose bg-vision-rose/20 border-vision-rose/30 animate-pulse"
      Icon = CircleX
    } else if (currentStock <= mat.reorder_point) {
      status = "Perlu Reorder"
      statusColor = "text-vision-amber bg-vision-amber/20 border-vision-amber/30"
      Icon = TriangleAlert
    }

    // Saran Order (Formula Sederhana: Kembalikan ke ROP + SS)
    const suggestedOrder = Math.max(0, mat.reorder_point - currentStock + mat.safety_stock)

    return { ...mat, currentStock, status, statusColor, Icon, suggestedOrder, matBatches }
  })

  // Hitung Agregat untuk KPI Cards
  const countAman = ewsData.filter(d => d.status === "Aman").length
  const countReorder = ewsData.filter(d => d.status === "Perlu Reorder").length
  const countKritis = ewsData.filter(d => d.status.includes("Kritis")).length

  // Hitung Estimasi Biaya di Modal
  const selectedMat = materials.find(m => m.id === formStock.material_id)
  const estimasiBiaya = selectedMat ? (parseFloat(formStock.qty || "0") * selectedMat.price_per_unit) : 0

  const formatRp = (val: number) => "Rp " + Math.round(val).toLocaleString('id-ID')

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Menghitung Kalkulasi EWS & Stok...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* HEADER */}
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white text-2xl shadow-glow-cyan">
            <Boxes size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              Manajemen Stok & Early Warning System
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">UMKM Mie Kurnia Jaya &bull; Pengelolaan Pesan Stok & Monitoring EWS</p>
          </div>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-bold text-xs transition-all flex items-center gap-2 shadow-glow-cyan hover:opacity-90"
        >
          <ShoppingCart size={16} />
          <span>+ Pesan Stok</span>
        </button>
      </div>

      {/* KPI CARDS EWS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="vision-glass p-5 rounded-2xl border-l-4 border-l-vision-emerald relative overflow-hidden">
          <div className="flex justify-between">
            <div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Stok Aman</span>
              <h3 className="text-2xl font-black text-vision-emerald mt-1">{countAman} Bahan</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-vision-emerald/20 text-vision-emerald flex items-center justify-center">
              <CircleCheck size={20} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Persediaan di atas Reorder Point (ROP)</p>
        </div>

        <div className="vision-glass p-5 rounded-2xl border-l-4 border-l-vision-amber relative overflow-hidden">
          <div className="flex justify-between">
            <div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Perlu Reorder (&le; ROP)</span>
              <h3 className="text-2xl font-black text-vision-amber mt-1">{countReorder} Bahan</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-vision-amber/20 text-vision-amber flex items-center justify-center">
              <TriangleAlert size={20} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">IP menyentuh ROP &mdash; Segera pesan ulang</p>
        </div>

        <div className="vision-glass p-5 rounded-2xl border-l-4 border-l-vision-rose relative overflow-hidden">
          <div className="flex justify-between">
            <div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Kritis (&le; SS)</span>
              <h3 className="text-2xl font-black text-vision-rose mt-1">{countKritis} Bahan</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-vision-rose/20 text-vision-rose flex items-center justify-center">
              <CircleX size={20} className="animate-pulse" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Stok menyentuh/di bawah Safety Stock (SS)</p>
        </div>
      </div>

      {/* TABEL EWS */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="text-vision-cyan" size={18} /> Monitoring Stok & Umur Stock
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Rincian persediaan bahan baku beserta indikator EWS secara Real-Time.</p>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-vision-emerald animate-pulse"></span> Live Data
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[950px]">
            <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
              <tr>
                <th className="pb-3 px-3 font-semibold text-left w-[15%]">Bahan Baku</th>
                <th className="pb-3 px-3 font-semibold text-center w-[12%]">Stok Aktif</th>
                <th className="pb-3 px-3 font-semibold text-center w-[10%]">ROP</th>
                <th className="pb-3 px-3 font-semibold text-center w-[12%]">Saran Order</th>
                <th className="pb-3 px-3 font-semibold text-center w-[27%]">Rincian Umur Batch</th>
                <th className="pb-3 px-3 font-semibold text-center w-[15%]">Indikator EWS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-foreground">
              {ewsData.map(item => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3 font-bold text-left">{item.name}</td>
                  <td className="py-3 px-3 font-extrabold text-vision-cyan text-center">{item.currentStock.toLocaleString('id-ID')} {item.monitoring_unit}</td>
                  <td className="py-3 px-3 font-semibold text-muted-foreground text-center">{item.reorder_point.toLocaleString('id-ID')} {item.monitoring_unit}</td>
                  <td className="py-3 px-3 font-bold text-vision-purple text-center">{item.suggestedOrder.toLocaleString('id-ID')} {item.monitoring_unit}</td>
                  
                  {/* Umur Batch */}
                  <td className="py-3 px-3">
                    <div className="space-y-1.5 py-1 max-w-[260px] mx-auto">
                      {item.matBatches.length === 0 ? (
                        <span className="text-muted-foreground italic text-center block">Stok Kosong</span>
                      ) : (
                        item.matBatches.map(b => {
                          // Kalkulasi umur batch (hari)
                          const diffTime = Math.abs(new Date().getTime() - new Date(b.arrival_date).getTime())
                          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                          const proportion = Math.round((b.qty / (item.currentStock || 1)) * 100)
                          const badgeCol = days > 4 ? "bg-vision-amber/15 text-vision-amber border-vision-amber/30" : "bg-vision-cyan/15 text-vision-cyan border-vision-cyan/30"
                          
                          return (
                            <div key={b.id} className="flex items-center justify-between text-[11px] bg-background/40 px-3 py-1.5 rounded-lg border border-border w-full">
                              <span className={`px-2 py-0.5 rounded ${badgeCol} border text-[10px] font-semibold whitespace-nowrap`}>
                                {days} Hari lalu
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">{b.qty.toLocaleString('id-ID')} {item.monitoring_unit}</span>
                                <span className="text-vision-cyan font-black">({proportion}%)</span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </td>
                  
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-1 rounded-full border font-bold flex items-center justify-center gap-1.5 w-full ${item.statusColor}`}>
                      <item.Icon size={14} /> {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABEL LOG PEMESANAN */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Clock className="text-vision-cyan" size={18} /> Riwayat Log Kedatangan Stok
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Catatan kronologis penerimaan bahan baku.</p>
          </div>
          <button className="px-3.5 py-2 rounded-xl bg-vision-emerald/10 text-vision-emerald border border-vision-emerald/30 hover:bg-vision-emerald/20 text-xs font-semibold flex items-center gap-1.5 transition-all">
            <FileDown size={14} /> Unduh CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[850px]">
            <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
              <tr>
                <th className="pb-3 px-3 font-semibold text-left">Waktu Input</th>
                <th className="pb-3 px-3 font-semibold text-left">Tgl Kedatangan</th>
                <th className="pb-3 px-3 font-semibold text-left">Bahan Baku</th>
                <th className="pb-3 px-3 font-semibold text-center">Jumlah</th>
                <th className="pb-3 px-3 font-semibold text-left">Supplier/Keterangan</th>
                <th className="pb-3 px-3 font-semibold text-right">Estimasi Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-foreground">
              {batches.map(log => {
                const mat = materials.find(m => m.id === log.material_id)
                const logCost = mat ? (log.qty * mat.price_per_unit) : 0
                return (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-3 font-mono text-[10px] text-muted-foreground text-left">
                      {new Date(log.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 font-bold text-vision-emerald text-left">{log.arrival_date}</td>
                    <td className="py-3 px-3 font-bold text-left">{mat?.name || 'Unknown'}</td>
                    <td className="py-3 px-3 font-extrabold text-vision-cyan text-center">
                      {log.qty.toLocaleString('id-ID')} {mat?.monitoring_unit}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground text-left">{log.supplier || '-'}</td>
                    <td className="py-3 px-3 text-vision-amber font-bold text-right">{formatRp(logCost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================= */}
      {/* MODAL PESAN STOK (Tailwind Manual Vision) */}
      {/* ========================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="vision-glass w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/50 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vision-cyan/20 text-vision-cyan flex items-center justify-center">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Form Pesan & Input Stok</h3>
                  <p className="text-xs text-muted-foreground">Pencatatan kedatangan barang baru.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStockIn} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Bahan Baku</label>
                <select 
                  required 
                  value={formStock.material_id}
                  onChange={e => setFormStock({...formStock, material_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value="" disabled>-- Pilih Bahan Baku --</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.monitoring_unit})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex justify-between">
                  <span>Jumlah Masuk</span>
                  {selectedMat && <span className="text-muted-foreground">Satuan: {selectedMat.monitoring_unit}</span>}
                </label>
                <input 
                  type="number" required min="1" step="0.01"
                  value={formStock.qty}
                  onChange={e => setFormStock({...formStock, qty: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none" 
                />
              </div>

              {/* Box Estimasi Biaya */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-vision-amber/10 border border-vision-amber/30">
                <div>
                  <p className="text-[10px] font-bold text-vision-amber uppercase tracking-wider">Estimasi Nilai Barang</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {selectedMat ? `Berdasarkan HPP: ${formatRp(selectedMat.price_per_unit)} / ${selectedMat.monitoring_unit}` : 'Pilih bahan baku.'}
                  </p>
                </div>
                <span className="text-base font-black text-vision-amber">{formatRp(estimasiBiaya)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Tanggal Kedatangan</label>
                  <input 
                    type="date" required 
                    value={formStock.arrival_date}
                    onChange={e => setFormStock({...formStock, arrival_date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Supplier/Keterangan</label>
                  <input 
                    type="text" required placeholder="Contoh: PT Segitiga"
                    value={formStock.supplier}
                    onChange={e => setFormStock({...formStock, supplier: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none" 
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold">
                  Batal
                </button>
                <button disabled={isSubmitting} type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
                  Simpan Stok Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}