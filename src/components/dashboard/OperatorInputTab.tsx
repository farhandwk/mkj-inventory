'use client'

import { useState, useEffect, useMemo } from "react"
import { ClipboardList, PackagePlus, Loader2, Send, CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

type ProductOption = { id: string; name: string; unit: string }
type MaterialOption = { id: string; name: string; monitoring_unit: string }

export default function OperatorInputTab() {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Form Input Pesanan Produk
  const [orderForm, setOrderForm] = useState({
    customer_name: "",
    order_date: new Date().toISOString().split('T')[0],
    deadline_date: "",
    product_id: "",
    qty: ""
  })
  const [submittingOrder, setSubmittingOrder] = useState(false)

  // Form Input Stok Bahan Baku (Batch Masuk)
  const [materialForm, setMaterialForm] = useState({
    material_id: "",
    qty: "",
    order_date: new Date().toISOString().split('T')[0],
    arrival_date: "",
    supplier: ""
  })
  const [submittingMaterial, setSubmittingMaterial] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadOptions = async () => {
      setIsLoading(true)
      const [prodRes, matRes] = await Promise.all([
        supabase.from('products').select('id, name, unit').order('name'),
        supabase.from('materials').select('id, name, monitoring_unit').order('name')
      ])
      if (prodRes.data) setProducts(prodRes.data)
      if (matRes.data) setMaterials(matRes.data)
      setIsLoading(false)
    }
    loadOptions()
  }, [supabase])

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderForm.customer_name || !orderForm.product_id || !orderForm.qty || !orderForm.deadline_date) {
      return alert("Lengkapi semua data pesanan produk.")
    }

    setSubmittingOrder(true)
    setStatusMessage(null)

    const { data: createdOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_name: orderForm.customer_name,
        order_date: orderForm.order_date,
        deadline_date: orderForm.deadline_date,
        status: 'pending'
      })
      .select()
      .single()

    if (orderErr || !createdOrder) {
      setSubmittingOrder(false)
      return alert(`Gagal menyimpan pesanan: ${orderErr?.message}`)
    }

    const { error: itemErr } = await supabase
      .from('order_items')
      .insert({
        order_id: createdOrder.id,
        product_id: orderForm.product_id,
        qty: parseFloat(orderForm.qty)
      })

    setSubmittingOrder(false)
    if (itemErr) {
      alert(`Gagal menyimpan detail produk: ${itemErr.message}`)
    } else {
      setOrderForm({
        customer_name: "",
        order_date: new Date().toISOString().split('T')[0],
        deadline_date: "",
        product_id: "",
        qty: ""
      })
      setStatusMessage("Input pesanan produk berhasil disimpan.")
    }
  }

  const handleMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedQty = parseFloat(materialForm.qty)
    if (!materialForm.material_id || Number.isNaN(parsedQty) || parsedQty <= 0 || !materialForm.order_date) {
      return alert("Lengkapi bahan baku, jumlah (> 0), dan tanggal pesan.")
    }

    setSubmittingMaterial(true)
    setStatusMessage(null)

    const { error } = await supabase
      .from('inventory_batches')
      .insert({
        material_id: materialForm.material_id,
        initial_qty: parsedQty,
        qty: parsedQty,
        order_date: materialForm.order_date,
        arrival_date: materialForm.arrival_date || null,
        supplier: materialForm.supplier?.trim() || null,
        verification_status: 'pending'
      })

    setSubmittingMaterial(false)
    if (error) {
      alert(`Gagal menyimpan input bahan baku: ${error.message}`)
    } else {
      setMaterialForm({
        material_id: "",
        qty: "",
        order_date: new Date().toISOString().split('T')[0],
        arrival_date: "",
        supplier: ""
      })
      setStatusMessage("Input bahan baku berhasil disimpan dan menunggu verifikasi.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-3 text-vision-cyan">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-xs font-bold animate-pulse">Memuat Form Input Operator...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-black text-foreground">Input Pesanan Produk & Bahan Baku</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Halaman khusus pencatatan operasional harian bahan baku dan pesanan produk.
          </p>
        </div>

        {statusMessage && (
          <div className="px-3.5 py-2 rounded-xl bg-vision-emerald/15 border border-vision-emerald/30 text-vision-emerald text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FORM 1: INPUT PESANAN PRODUK */}
        <div className="vision-glass p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <div className="w-10 h-10 rounded-xl bg-vision-cyan/20 text-vision-cyan flex items-center justify-center">
              <ClipboardList size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Input Pesanan Produk</h3>
              <p className="text-xs text-muted-foreground">Catat pesanan produk jadi masuk.</p>
            </div>
          </div>

          <form onSubmit={handleOrderSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Nama Pelanggan</label>
              <input
                type="text"
                required
                placeholder="Contoh: Toko Sumber Rejeki"
                value={orderForm.customer_name}
                onChange={e => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Tanggal Pesan</label>
                <input
                  type="date"
                  required
                  value={orderForm.order_date}
                  onChange={e => setOrderForm({ ...orderForm, order_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Deadline</label>
                <input
                  type="date"
                  required
                  value={orderForm.deadline_date}
                  onChange={e => setOrderForm({ ...orderForm, deadline_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Produk</label>
                <select
                  required
                  value={orderForm.product_id}
                  onChange={e => setOrderForm({ ...orderForm, product_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value="" disabled>-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Jumlah</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="Contoh: 25"
                  value={orderForm.qty}
                  onChange={e => setOrderForm({ ...orderForm, qty: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                disabled={submittingOrder}
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50"
              >
                {submittingOrder ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Simpan Pesanan
              </button>
            </div>
          </form>
        </div>

        {/* FORM 2: INPUT BAHAN BAKU */}
        <div className="vision-glass p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <div className="w-10 h-10 rounded-xl bg-vision-blue/20 text-vision-blue flex items-center justify-center">
              <PackagePlus size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Input Bahan Baku</h3>
              <p className="text-xs text-muted-foreground">Catat pemesanan atau kedatangan stok bahan baku.</p>
            </div>
          </div>

          <form onSubmit={handleMaterialSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Bahan Baku</label>
                <select
                  required
                  value={materialForm.material_id}
                  onChange={e => setMaterialForm({ ...materialForm, material_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value="" disabled>-- Pilih Bahan Baku --</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.monitoring_unit})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Jumlah</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="Contoh: 100"
                  value={materialForm.qty}
                  onChange={e => setMaterialForm({ ...materialForm, qty: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Tanggal Pesan</label>
                <input
                  type="date"
                  required
                  value={materialForm.order_date}
                  onChange={e => setMaterialForm({ ...materialForm, order_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Tanggal Tiba (Opsional)</label>
                <input
                  type="date"
                  value={materialForm.arrival_date}
                  onChange={e => setMaterialForm({ ...materialForm, arrival_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Supplier (Opsional)</label>
              <input
                type="text"
                placeholder="Contoh: PT Bogasari / Toko Bahan Kue"
                value={materialForm.supplier}
                onChange={e => setMaterialForm({ ...materialForm, supplier: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                disabled={submittingMaterial}
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50"
              >
                {submittingMaterial ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Simpan Bahan Baku
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}