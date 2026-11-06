'use client'

import { useState, useEffect } from "react"
import { Sliders, Calculator, Coins, Utensils, Save, RotateCcw, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

// --- Tipe Data TypeScript ---
type Overhead = { order_cost: number; holding_cost: number; z_score_factor: number }
type Material = { id: string; name: string; monitoring_unit: string; price_per_unit: number }
type Product = { id: string; name: string; unit: string }
type RecipeMap = Record<string, Record<string, number>> // { product_id: { material_id: qty } }

export default function SettingTab() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // State Dinamis
  const [overhead, setOverhead] = useState<Overhead>({ order_cost: 0, holding_cost: 0, z_score_factor: 1.65 })
  const [materials, setMaterials] = useState<Material[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<RecipeMap>({})

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
          supabase.from('materials').select('id, name, monitoring_unit, price_per_unit').order('created_at'),
          supabase.from('products').select('id, name, unit').order('created_at'),
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-vision-cyan">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="font-bold animate-pulse">Memuat Struktur Database Dinamis...</p>
      </div>
    )
  }

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
            
            {/* Render Produk Dinamis */}
            {products.map((prod, index) => {
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
    </div>
  )
}