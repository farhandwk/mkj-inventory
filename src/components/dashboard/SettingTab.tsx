'use client'

import { useState, useEffect } from "react"
import {
  Sliders, Calculator, Coins, Utensils, Save, RotateCcw, Loader2,
  Package, Plus, Pencil, Trash2, Archive, ArchiveRestore, X
} from "lucide-react"
import { createClient } from "@/lib/supabase"

// --- Tipe Data TypeScript ---
type Overhead = { order_cost: number; holding_cost: number; z_score_factor: number }
type Material = { id: string; name: string; monitoring_unit: string; price_per_unit: number; is_active?: boolean }
type Product = { id: string; name: string; unit: string; selling_price: number; is_active?: boolean }
type RecipeMap = Record<string, Record<string, number>> // { product_id: { material_id: qty } }
type CrudType = 'product' | 'material'

export default function SettingTab() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // State Dinamis
  const [overhead, setOverhead] = useState<Overhead>({ order_cost: 0, holding_cost: 0, z_score_factor: 1.65 })
  const [materials, setMaterials] = useState<Material[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<RecipeMap>({})

  // State CRUD Data Master
  const [crudTab, setCrudTab] = useState<CrudType>('product')
  const [modal, setModal] = useState<{ type: CrudType; id: string | null } | null>(null)
  const [form, setForm] = useState({ name: "", unit: "", price: "" })
  const [isCrudSaving, setIsCrudSaving] = useState(false)

  // Palet Warna Dinamis untuk Card Produk
  const COLOR_CLASSES = [
    { bg: 'bg-vision-cyan', text: 'text-vision-cyan', border: 'border-vision-cyan', badge: 'bg-vision-cyan/20' },
    { bg: 'bg-vision-purple', text: 'text-vision-purple', border: 'border-vision-purple', badge: 'bg-vision-purple/20' },
    { bg: 'bg-vision-amber', text: 'text-vision-amber', border: 'border-vision-amber', badge: 'bg-vision-amber/20' },
    { bg: 'bg-vision-emerald', text: 'text-vision-emerald', border: 'border-vision-emerald', badge: 'bg-vision-emerald/20' },
  ]

  // 1. FETCH DATA DINAMIS DARI SUPABASE
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      
      try {
        // Fetch semua tabel secara paralel agar lebih cepat
        const [ovRes, matRes, prodRes, recRes] = await Promise.all([
          supabase.from('overhead_costs').select('*').eq('id', 1).single(),
          supabase.from('materials').select('*').order('created_at'),
          supabase.from('products').select('*').order('created_at'),
          supabase.from('recipes').select('*')
        ])

        if (ovRes.data) {
          setOverhead({
            order_cost: ovRes.data.order_cost,
            holding_cost: ovRes.data.holding_cost,
            z_score_factor: ovRes.data.z_score_factor
          })
        }
        
        if (matRes.data) setMaterials(matRes.data)
        if (prodRes.data) setProducts(prodRes.data)

        // Bangun Object Map untuk Resep
        if (prodRes.data && matRes.data && recRes.data) {
          const newRecipeMap: RecipeMap = {}
          
          prodRes.data.forEach(p => {
            newRecipeMap[p.id] = {}
            matRes.data.forEach(m => {
              // Cari relasi resep yang cocok, jika tidak ada set 0
              const r = recRes.data.find(x => x.product_id === p.id && x.material_id === m.id)
              newRecipeMap[p.id][m.id] = r ? parseFloat(r.qty_per_kg) : 0
            })
          })
          setRecipes(newRecipeMap)
        }
      } catch (error) {
        console.error("Gagal menarik data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // 2. SIMPAN DATA KE SUPABASE (UPSERT DINAMIS)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      // A. Update Overhead
      await supabase.from('overhead_costs').update(overhead).eq('id', 1)

      // B. Update Semua Harga Materials
      const matPromises = materials.map(m => 
        supabase.from('materials').update({ price_per_unit: m.price_per_unit }).eq('id', m.id)
      )
      await Promise.all(matPromises)

      // C. Update Resep (Upsert massal)
      const recipeUpserts = []
      for (const pId of Object.keys(recipes)) {
        for (const mId of Object.keys(recipes[pId])) {
          recipeUpserts.push({
            product_id: pId,
            material_id: mId,
            qty_per_kg: recipes[pId][mId]
          })
        }
      }
      
      // Upsert membutuhkan unique constraint (product_id, material_id) yang sudah kita buat di DB
      const { error: recipeError } = await supabase
        .from('recipes')
        .upsert(recipeUpserts, { onConflict: 'product_id,material_id' })

      if (recipeError) throw recipeError

      alert("Berhasil! Semua pengaturan dinamis tersimpan ke Database.")
    } catch (error: any) {
      alert(`Gagal menyimpan data: ${error.message}`)
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  // Helper: Hitung HPP per Produk
  const hitungHpp = (productId: string) => {
    let total = 0
    const prodRecipe = recipes[productId]
    if (!prodRecipe) return total

    materials.forEach(m => {
      const qty = prodRecipe[m.id] || 0
      total += (qty * m.price_per_unit)
    })
    return total
  }

  // Handler Perubahan Input Harga Bahan
  const handlePriceChange = (id: string, newPrice: number) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, price_per_unit: newPrice } : m))
  }

  // Handler Perubahan Input Resep
  const handleRecipeChange = (pId: string, mId: string, newQty: number) => {
    setRecipes(prev => ({
      ...prev,
      [pId]: {
        ...prev[pId],
        [mId]: newQty
      }
    }))
  }

  const formatRp = (val: number) => "Rp " + Math.round(val).toLocaleString('id-ID')

  // =========================================================
  // 3. CRUD DATA MASTER (PRODUK & BAHAN BAKU)
  // =========================================================
  const openAdd = (type: CrudType) => {
    setForm({ name: "", unit: type === 'product' ? "Kg" : "", price: "" })
    setModal({ type, id: null })
  }

  const openEditProduct = (p: Product) => {
    setForm({ name: p.name, unit: p.unit, price: String(p.selling_price) })
    setModal({ type: 'product', id: p.id })
  }

  const openEditMaterial = (m: Material) => {
    setForm({ name: m.name, unit: m.monitoring_unit, price: String(m.price_per_unit) })
    setModal({ type: 'material', id: m.id })
  }

  const handleCrudSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modal) return

    const name = form.name.trim()
    const unit = form.unit.trim()
    const price = parseFloat(form.price)

    if (!name || !unit || isNaN(price) || price < 0) {
      return alert("Nama, satuan, dan harga wajib diisi dengan benar!")
    }

    // Cegah nama ganda (tanpa membedakan huruf besar/kecil)
    const list = modal.type === 'product' ? products : materials
    const duplicate = list.some(x => x.id !== modal.id && x.name.trim().toLowerCase() === name.toLowerCase())
    if (duplicate) return alert(`Nama "${name}" sudah dipakai. Gunakan nama lain.`)

    setIsCrudSaving(true)

    if (modal.type === 'product') {
      const payload = { name, unit, selling_price: price }
      const query = modal.id
        ? supabase.from('products').update(payload).eq('id', modal.id).select().single()
        : supabase.from('products').insert(payload).select().single()
      const { data, error } = await query

      if (error || !data) {
        alert(`Gagal menyimpan produk: ${error?.message}`)
      } else {
        const saved = data as Product
        if (modal.id) {
          setProducts(prev => prev.map(p => p.id === saved.id ? saved : p))
        } else {
          setProducts(prev => [...prev, saved])
          // Siapkan baris resep kosong untuk produk baru
          setRecipes(prev => ({
            ...prev,
            [saved.id]: Object.fromEntries(materials.map(m => [m.id, 0]))
          }))
        }
        setModal(null)
      }
    } else {
      const payload = { name, monitoring_unit: unit, price_per_unit: price }
      const query = modal.id
        ? supabase.from('materials').update(payload).eq('id', modal.id).select().single()
        : supabase.from('materials').insert(payload).select().single()
      const { data, error } = await query

      if (error || !data) {
        alert(`Gagal menyimpan bahan baku: ${error?.message}`)
      } else {
        const saved = data as Material
        if (modal.id) {
          setMaterials(prev => prev.map(m => m.id === saved.id ? saved : m))
        } else {
          setMaterials(prev => [...prev, saved])
          // Tambahkan kolom resep kosong untuk bahan baru di setiap produk
          setRecipes(prev => {
            const next: RecipeMap = {}
            Object.keys(prev).forEach(pId => { next[pId] = { ...prev[pId], [saved.id]: 0 } })
            return next
          })
        }
        setModal(null)
      }
    }

    setIsCrudSaving(false)
  }

  // Arsip / aktifkan kembali (soft delete, riwayat data tetap utuh)
  const handleToggleArchive = async (type: CrudType, row: Product | Material) => {
    const table = type === 'product' ? 'products' : 'materials'
    const nextActive = row.is_active === false // sedang arsip -> aktifkan
    const { error } = await supabase.from(table).update({ is_active: nextActive }).eq('id', row.id)

    if (error) {
      return alert(`Gagal mengubah status arsip: ${error.message}\n\nPastikan kolom is_active sudah ditambahkan di tabel ${table}.`)
    }
    if (type === 'product') {
      setProducts(prev => prev.map(p => p.id === row.id ? { ...p, is_active: nextActive } : p))
    } else {
      setMaterials(prev => prev.map(m => m.id === row.id ? { ...m, is_active: nextActive } : m))
    }
  }

  // Hapus permanen produk (diblokir bila pernah terjual)
  const handleDeleteProduct = async (p: Product) => {
    const { count, error: countError } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', p.id)

    if (countError) return alert(`Gagal memeriksa riwayat penjualan: ${countError.message}`)
    if (count && count > 0) {
      return alert(
        `"${p.name}" tidak bisa dihapus permanen karena sudah tercatat di ${count} item pesanan.\n\n` +
        `Gunakan tombol Arsip agar produk tidak muncul lagi tetapi riwayat pesanan tetap utuh.`
      )
    }

    if (!confirm(`Hapus permanen produk "${p.name}"?\nResep produk ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.`)) return

    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) {
      if (error.code === '23503') {
        return alert(`"${p.name}" masih dipakai di data lain sehingga tidak bisa dihapus. Gunakan Arsip.`)
      }
      return alert(`Gagal menghapus produk: ${error.message}`)
    }

    setProducts(prev => prev.filter(x => x.id !== p.id))
    setRecipes(prev => {
      const next = { ...prev }
      delete next[p.id]
      return next
    })
  }

  // Hapus permanen bahan baku (diblokir bila punya riwayat pembelian atau masih dipakai resep)
  const handleDeleteMaterial = async (m: Material) => {
    const { count: batchCount, error: batchError } = await supabase
      .from('inventory_batches')
      .select('id', { count: 'exact', head: true })
      .eq('material_id', m.id)

    if (batchError) return alert(`Gagal memeriksa riwayat pembelian: ${batchError.message}`)
    if (batchCount && batchCount > 0) {
      return alert(
        `"${m.name}" tidak bisa dihapus permanen karena memiliki ${batchCount} batch pembelian/stok.\n\n` +
        `Menghapusnya akan ikut menghapus seluruh riwayat stok bahan ini. Gunakan tombol Arsip.`
      )
    }

    const usedBy = products.filter(p => (recipes[p.id]?.[m.id] || 0) > 0)
    if (usedBy.length > 0) {
      return alert(
        `"${m.name}" masih dipakai di resep: ${usedBy.map(p => p.name).join(', ')}.\n\n` +
        `Kosongkan takarannya di resep (isi 0) dan simpan, atau gunakan Arsip.`
      )
    }

    if (!confirm(`Hapus permanen bahan baku "${m.name}"? Tindakan ini tidak bisa dibatalkan.`)) return

    // Bersihkan baris resep kosong (qty 0) milik bahan ini terlebih dahulu
    const { error: recipeError } = await supabase.from('recipes').delete().eq('material_id', m.id)
    if (recipeError) return alert(`Gagal membersihkan resep bahan: ${recipeError.message}`)

    const { error } = await supabase.from('materials').delete().eq('id', m.id)
    if (error) return alert(`Gagal menghapus bahan baku: ${error.message}`)

    setMaterials(prev => prev.filter(x => x.id !== m.id))
    setRecipes(prev => {
      const next: RecipeMap = {}
      Object.keys(prev).forEach(pId => {
        const { [m.id]: _removed, ...rest } = prev[pId]
        next[pId] = rest
      })
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Memuat Struktur Database Dinamis...</p>
      </div>
    )
  }

  const crudInputClass = "w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Setting */}
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white text-2xl shadow-glow-cyan">
            <Sliders size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              Manajemen Konfigurasi Sistem (Dinamis)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Perubahan produk atau bahan baru di database akan otomatis muncul di sini.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs transition-all flex items-center gap-2 border border-border"
          >
            <RotateCcw size={14} /> Refresh Data
          </button>
          <button 
            type="button" 
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-extrabold text-xs transition-all flex items-center gap-2 shadow-glow-cyan hover:opacity-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Kolom Kiri: Parameter EWS & Harga Bahan Baku */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card Parameter EWS */}
          <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="border-b border-border pb-3 flex items-center gap-2">
              <Calculator className="text-vision-amber" size={18} />
              <h3 className="text-base font-bold text-foreground">Ketentuan Parameter EWS</h3>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground block mb-1">Biaya Pesan (S) per Pesanan</label>
                <input 
                  type="number" 
                  value={overhead.order_cost} 
                  onChange={(e) => setOverhead({...overhead, order_cost: Number(e.target.value)})}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none" 
                />
              </div>
              <div>
                <label className="font-semibold text-muted-foreground block mb-1">Biaya Simpan (H) per Unit/Periode</label>
                <input 
                  type="number" 
                  value={overhead.holding_cost} 
                  onChange={(e) => setOverhead({...overhead, holding_cost: Number(e.target.value)})}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-foreground font-bold focus:border-vision-cyan outline-none" 
                />
              </div>
              <div>
                <label className="font-semibold text-muted-foreground block mb-1">Tingkat Pelayanan (Z-Score Factor)</label>
                <select 
                  value={overhead.z_score_factor} 
                  onChange={(e) => setOverhead({...overhead, z_score_factor: Number(e.target.value)})}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                >
                  <option value={1.65}>95% (Z = 1.65)</option>
                  <option value={1.96}>97.5% (Z = 1.96)</option>
                  <option value={2.33}>99% (Z = 2.33)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card Harga Satuan Bahan Baku */}
          <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="text-vision-amber" size={18} />
                <h3 className="text-base font-bold text-foreground">Daftar Bahan Baku</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-vision-cyan/20 text-vision-cyan border border-vision-cyan/30">Live HPP</span>
            </div>
            
            {/* Render Bahan Baku Dinamis */}
            <div className="space-y-3 text-xs">
              {materials.map(mat => (
                <div key={mat.id}>
                  <label className="font-semibold text-muted-foreground flex justify-between mb-1">
                    <span>{mat.name}</span> 
                    <span className="text-[10px]">Rp / {mat.monitoring_unit}</span>
                  </label>
                  <input 
                    type="number" 
                    value={mat.price_per_unit} 
                    onChange={(e) => handlePriceChange(mat.id, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground font-bold outline-none focus:border-vision-cyan" 
                  />
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Kolom Kanan: Takaran Resep Produk (Dinamis) */}
        <div className="lg:col-span-8 vision-glass p-6 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Utensils className="text-vision-cyan" size={18} /> Takaran Bill of Materials (BOM) per Produk
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Atur komposisi standar adonan. Nilai HPP akan dihitung otomatis sesuai harga satuan per unit monitoring bahan baku.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Render Produk Dinamis (produk yang diarsipkan tidak ditampilkan) */}
            {products.filter(p => p.is_active !== false).map((prod, index) => {
              const color = COLOR_CLASSES[index % COLOR_CLASSES.length] // Cycle warna
              
              return (
                <div key={prod.id} className={`p-4 rounded-2xl bg-background/50 border border-border space-y-4 hover:border-${color.border}/50 transition-colors`}>
                  
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <h4 className="font-bold text-foreground text-xs flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${color.bg}`} /> {prod.name}
                    </h4>
                    <span className={`text-[10px] ${color.text} ${color.badge} px-2 py-0.5 rounded-full font-semibold`}>
                      1 {prod.unit} Output
                    </span>
                  </div>

                  {/* Render Input Resep Dinamis berdasarkan Daftar Bahan Baku */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {materials.map(mat => (
                      <div key={mat.id}>
                        <label className="text-[10px] text-muted-foreground block mb-1 truncate" title={mat.name}>
                          {mat.name} ({mat.monitoring_unit})
                        </label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={recipes[prod.id]?.[mat.id] || 0} 
                          onChange={(e) => handleRecipeChange(prod.id, mat.id, Number(e.target.value))} 
                          className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-center font-bold" 
                        />
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border/55 flex justify-between items-center text-xs font-bold text-vision-amber">
                    <span>HPP Bahan / {prod.unit}:</span>
                    <span>{formatRp(hitungHpp(prod.id))}</span>
                  </div>
                  
                </div>
              )
            })}
          </div>

        </div>

      </div>

      {/* ========================================= */}
      {/* TABEL CRUD DATA MASTER: PRODUK & BAHAN BAKU */}
      {/* ========================================= */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Package className="text-vision-cyan" size={18} /> Kelola Data Master Produk & Bahan Baku
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tambah, ubah, arsipkan, atau hapus data master. Data yang sudah punya riwayat sebaiknya diarsipkan, bukan dihapus.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setCrudTab('product')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${crudTab === 'product' ? 'bg-vision-cyan/20 text-vision-cyan' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Produk ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setCrudTab('material')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${crudTab === 'material' ? 'bg-vision-cyan/20 text-vision-cyan' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Bahan Baku ({materials.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => openAdd(crudTab)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-bold text-xs transition-all flex items-center gap-2 shadow-glow-cyan hover:opacity-90"
            >
              <Plus size={14} />
              <span>{crudTab === 'product' ? 'Tambah Produk' : 'Tambah Bahan Baku'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {crudTab === 'product' ? (
            <table className="w-full text-xs border-collapse min-w-[800px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Nama Produk</th>
                  <th className="pb-3 px-3 font-semibold text-center">Satuan</th>
                  <th className="pb-3 px-3 font-semibold text-right">Harga Jual</th>
                  <th className="pb-3 px-3 font-semibold text-right">HPP Bahan / Unit</th>
                  <th className="pb-3 px-3 font-semibold text-right">Margin / Unit</th>
                  <th className="pb-3 px-3 font-semibold text-center">Status</th>
                  <th className="pb-3 px-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground italic">Belum ada data produk.</td>
                  </tr>
                ) : (
                  products.map(p => {
                    const archived = p.is_active === false
                    const hpp = hitungHpp(p.id)
                    const margin = p.selling_price - hpp
                    return (
                      <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${archived ? 'opacity-60' : ''}`}>
                        <td className="py-3 px-3 font-bold text-left">{p.name}</td>
                        <td className="py-3 px-3 text-center">{p.unit}</td>
                        <td className="py-3 px-3 text-right font-bold text-vision-emerald">{formatRp(p.selling_price)}</td>
                        <td className="py-3 px-3 text-right text-vision-amber font-semibold">{formatRp(hpp)}</td>
                        <td className={`py-3 px-3 text-right font-bold ${margin >= 0 ? 'text-vision-cyan' : 'text-vision-rose'}`}>{formatRp(margin)}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${archived ? 'bg-muted text-muted-foreground border-border' : 'bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30'}`}>
                            {archived ? 'Arsip' : 'Aktif'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => openEditProduct(p)} title="Ubah" className="p-1.5 rounded-lg bg-vision-blue/20 text-vision-blue hover:bg-vision-blue/30">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => handleToggleArchive('product', p)} title={archived ? 'Aktifkan kembali' : 'Arsipkan'} className="p-1.5 rounded-lg bg-vision-amber/20 text-vision-amber hover:bg-vision-amber/30">
                              {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                            </button>
                            <button type="button" onClick={() => handleDeleteProduct(p)} title="Hapus permanen" className="p-1.5 rounded-lg bg-vision-rose/20 text-vision-rose hover:bg-vision-rose/30">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Nama Bahan Baku</th>
                  <th className="pb-3 px-3 font-semibold text-center">Satuan Monitoring</th>
                  <th className="pb-3 px-3 font-semibold text-right">Harga / Satuan</th>
                  <th className="pb-3 px-3 font-semibold text-center">Dipakai di Resep</th>
                  <th className="pb-3 px-3 font-semibold text-center">Status</th>
                  <th className="pb-3 px-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground italic">Belum ada data bahan baku.</td>
                  </tr>
                ) : (
                  materials.map(m => {
                    const archived = m.is_active === false
                    const usedCount = products.filter(p => (recipes[p.id]?.[m.id] || 0) > 0).length
                    return (
                      <tr key={m.id} className={`hover:bg-muted/20 transition-colors ${archived ? 'opacity-60' : ''}`}>
                        <td className="py-3 px-3 font-bold text-left">{m.name}</td>
                        <td className="py-3 px-3 text-center">{m.monitoring_unit}</td>
                        <td className="py-3 px-3 text-right font-bold text-vision-amber">{formatRp(m.price_per_unit)}</td>
                        <td className="py-3 px-3 text-center font-semibold">{usedCount} produk</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${archived ? 'bg-muted text-muted-foreground border-border' : 'bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30'}`}>
                            {archived ? 'Arsip' : 'Aktif'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button type="button" onClick={() => openEditMaterial(m)} title="Ubah" className="p-1.5 rounded-lg bg-vision-blue/20 text-vision-blue hover:bg-vision-blue/30">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => handleToggleArchive('material', m)} title={archived ? 'Aktifkan kembali' : 'Arsipkan'} className="p-1.5 rounded-lg bg-vision-amber/20 text-vision-amber hover:bg-vision-amber/30">
                              {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                            </button>
                            <button type="button" onClick={() => handleDeleteMaterial(m)} title="Hapus permanen" className="p-1.5 rounded-lg bg-vision-rose/20 text-vision-rose hover:bg-vision-rose/30">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========================================= */}
      {/* MODAL TAMBAH / UBAH DATA MASTER */}
      {/* ========================================= */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="vision-glass w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/50 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-200">

            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vision-cyan/20 text-vision-cyan flex items-center justify-center">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {modal.id ? 'Ubah' : 'Tambah'} {modal.type === 'product' ? 'Produk' : 'Bahan Baku'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {modal.type === 'product'
                      ? 'Produk jadi yang dijual ke pelanggan.'
                      : 'Bahan baku yang dipakai dalam resep dan dipantau stoknya.'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setModal(null)} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCrudSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">
                  {modal.type === 'product' ? 'Nama Produk' : 'Nama Bahan Baku'}
                </label>
                <input
                  type="text" required
                  placeholder={modal.type === 'product' ? 'Contoh: Mie Telur Ayam' : 'Contoh: Tepung Terigu'}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className={crudInputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">
                    {modal.type === 'product' ? 'Satuan Jual' : 'Satuan Monitoring'}
                  </label>
                  <input
                    type="text" required list={`units-${modal.type}`}
                    placeholder={modal.type === 'product' ? 'Kg' : 'Kg / Liter / Butir'}
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    className={crudInputClass}
                  />
                  <datalist id={`units-${modal.type}`}>
                    {(modal.type === 'product' ? ['Kg', 'Pack'] : ['Kg', 'Liter', 'Butir', 'Pack', 'Gram']).map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">
                    {modal.type === 'product' ? 'Harga Jual (Rp)' : 'Harga / Satuan (Rp)'}
                  </label>
                  <input
                    type="number" required min="0" step="0.01" placeholder="Contoh: 15000"
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                    className={`${crudInputClass} font-bold`}
                  />
                </div>
              </div>

              {modal.id && (
                <p className="text-[11px] text-vision-amber leading-relaxed">
                  {modal.type === 'product'
                    ? 'Perhatian: mengubah harga jual juga mengubah nilai pendapatan pesanan lama di laporan keuangan, karena harga tidak disimpan per pesanan.'
                    : 'Perhatian: mengubah harga atau satuan bahan juga mengubah HPP historis di laporan keuangan.'}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold">
                  Batal
                </button>
                <button disabled={isCrudSaving} type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50">
                  {isCrudSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}