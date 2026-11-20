'use client'

import { useState, useEffect, useMemo } from "react"
import {
  Package, CheckCircle2, XCircle, Pencil, Trash2,
  Loader2, X, Save, History, ClipboardCheck, Layers,
  Search, RotateCcw
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import ServerPagination from "@/components/ui/ServerPagination"

type VerificationStatus = 'pending' | 'approved' | 'rejected'

type MaterialItem = {
  id: string
  name: string
  monitoring_unit: string
}

type BatchAgeBadge = {
  id: string
  ageDays: number
  remainingQty: number
  initialQty: number
  arrivalDate: string | null
  orderDate: string
}

type StockMonitorRow = {
  material_id: string
  name: string
  monitoring_unit: string
  current_stock: number
  on_hand_qty: number
  in_transit_qty: number
  safety_stock?: number
  rop?: number
  eoq?: number
  ews_status?: string
  batch_ages: BatchAgeBadge[]
}

type BatchRow = {
  id: string
  material_id: string
  qty: number
  initial_qty: number
  order_date: string
  arrival_date: string | null
  supplier: string | null
  verification_status: VerificationStatus
  created_at: string
  materials?: { name: string; monitoring_unit: string } | { name: string; monitoring_unit: string }[] | null
}

type TableFilterState = {
  dateFrom: string
  dateTo: string
  materialId: string
  supplierSearch: string
}

const PAGE_SIZE = 10

const EMPTY_FILTER: TableFilterState = {
  dateFrom: "",
  dateTo: "",
  materialId: "",
  supplierSearch: "",
}

function getMaterialMeta(mat: BatchRow['materials']) {
  if (!mat) return { name: '-', unit: 'Kg' }
  const obj = Array.isArray(mat) ? mat[0] : mat
  return {
    name: obj?.name || '-',
    unit: obj?.monitoring_unit || 'Kg',
  }
}

function calculateAgeDays(dateStr: string): number {
  const parsed = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return 0
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = todayStart.getTime() - parsed.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export default function StockTab() {
  const supabase = useMemo(() => createClient(), [])

  const [materials, setMaterials] = useState<MaterialItem[]>([])

  // Tabel 0: Monitoring Stock Terkini (Server-side pagination)
  const [stockRows, setStockRows] = useState<StockMonitorRow[]>([])
  const [stockPage, setStockPage] = useState(1)
  const [stockTotal, setStockTotal] = useState(0)
  const [loadingStock, setLoadingStock] = useState(true)

  // Filter & State Tabel 1: Verifikasi Pesanan Stock (pending)
  const [pendingFilter, setPendingFilter] = useState<TableFilterState>(EMPTY_FILTER)
  const [pendingBatches, setPendingBatches] = useState<BatchRow[]>([])
  const [pendingPage, setPendingPage] = useState(1)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loadingPending, setLoadingPending] = useState(true)

  // Filter & State Tabel 2: Riwayat Log Pemesanan & Kedatangan
  const [historyFilter, setHistoryFilter] = useState<TableFilterState>(EMPTY_FILTER)
  const [historyBatches, setHistoryBatches] = useState<BatchRow[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Action & Modal Edit State
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [editingBatch, setEditingBatch] = useState<BatchRow | null>(null)
  const [editForm, setEditForm] = useState({
    material_id: "",
    initial_qty: "",
    order_date: "",
    arrival_date: "",
    supplier: "",
    verification_status: "pending" as VerificationStatus,
  })
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  useEffect(() => {
    const fetchMaterials = async () => {
      const { data } = await supabase
        .from('materials')
        .select('id, name, monitoring_unit')
        .order('name')
      if (data) setMaterials(data)
    }
    fetchMaterials()
  }, [supabase])

  // Fetch Monitoring Stock Terkini + Umur Batch Fisik (sinkron dengan initial_qty & qty)
  const fetchStockMonitor = async (targetPage = stockPage) => {
    setLoadingStock(true)
    const from = (targetPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data: matData, count: matCount, error: matError } = await supabase
      .from('materials')
      .select('id, name, monitoring_unit', { count: 'exact' })
      .order('name')
      .range(from, to)

    if (matError || !matData) {
      setStockRows([])
      setStockTotal(0)
      setLoadingStock(false)
      return
    }

    const ids = matData.map(m => m.id)

    const [{ data: approvedBatches }, { data: ewsData, error: ewsError }] = await Promise.all([
      supabase
        .from('inventory_batches')
        .select('id, material_id, qty, initial_qty, order_date, arrival_date, created_at')
        .in('material_id', ids)
        .eq('verification_status', 'approved')
        .order('arrival_date', { ascending: true, nullsFirst: false })
        .order('order_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('v_ews_parameters')
        .select('*')
        .in('material_id', ids),
    ])

    const batchesByMaterial = new Map<string, BatchRow[]>()
    for (const raw of (approvedBatches || []) as BatchRow[]) {
      const list = batchesByMaterial.get(raw.material_id) || []
      list.push(raw)
      batchesByMaterial.set(raw.material_id, list)
    }

    const ewsMap = new Map<string, Record<string, unknown>>()
    if (!ewsError && ewsData) {
      for (const row of ewsData as Record<string, unknown>[]) {
        const key = String(row.material_id ?? row.id ?? '')
        if (key) ewsMap.set(key, row)
      }
    }

    const pickNum = (...vals: unknown[]): number | null => {
      for (const v of vals) {
        if (v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v))) {
          return Number(v)
        }
      }
      return null
    }

    const mapped: StockMonitorRow[] = matData.map(m => {
      const ews = ewsMap.get(m.id)
      const matBatches = batchesByMaterial.get(m.id) || []

      let onHandQty = 0
      let inTransitQty = 0
      const physicalAges: BatchAgeBadge[] = []

      for (const b of matBatches) {
        const remQty = Number(b.qty ?? 0)
        const initQty = Number(b.initial_qty ?? b.qty ?? 0)

        if (b.arrival_date) {
          onHandQty += remQty
          if (remQty > 0) {
            physicalAges.push({
              id: b.id,
              ageDays: calculateAgeDays(b.arrival_date),
              remainingQty: remQty,
              initialQty: initQty,
              arrivalDate: b.arrival_date,
              orderDate: b.order_date,
            })
          }
        } else {
          inTransitQty += remQty
        }
      }

      const activeStock = onHandQty + inTransitQty

      return {
        material_id: m.id,
        name: m.name,
        monitoring_unit: m.monitoring_unit,
        current_stock: activeStock,
        on_hand_qty: onHandQty,
        in_transit_qty: inTransitQty,
        safety_stock: pickNum(ews?.safety_stock, ews?.safety_stock_dynamic) ?? undefined,
        rop: pickNum(ews?.rop, ews?.reorder_point_dynamic) ?? undefined,
        eoq: pickNum(ews?.eoq, ews?.eoq_dynamic) ?? undefined,
        ews_status: typeof ews?.ews_status === 'string' ? ews.ews_status : undefined,
        batch_ages: physicalAges,
      }
    })

    setStockRows(mapped)
    setStockTotal(matCount || 0)
    setLoadingStock(false)
  }

  // Helper membangun query terfilter untuk tabel batch
  const buildFilteredBatchQuery = (
    filter: TableFilterState,
    onlyPending: boolean
  ) => {
    let query = supabase
      .from('inventory_batches')
      .select(
        'id, material_id, qty, initial_qty, order_date, arrival_date, supplier, verification_status, created_at, materials(name, monitoring_unit)',
        { count: 'exact' }
      )

    if (onlyPending) {
      query = query.eq('verification_status', 'pending')
    }
    if (filter.dateFrom) {
      query = query.gte('order_date', filter.dateFrom)
    }
    if (filter.dateTo) {
      query = query.lte('order_date', filter.dateTo)
    }
    if (filter.materialId) {
      query = query.eq('material_id', filter.materialId)
    }
    if (filter.supplierSearch.trim()) {
      query = query.ilike('supplier', `%${filter.supplierSearch.trim()}%`)
    }

    return query
  }

  const fetchPendingBatches = async (
    targetPage = pendingPage,
    filter = pendingFilter
  ) => {
    setLoadingPending(true)
    const from = (targetPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count, error } = await buildFilteredBatchQuery(filter, true)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      alert(`Gagal memuat antrean verifikasi: ${error.message}`)
    } else {
      setPendingBatches((data || []) as BatchRow[])
      setPendingTotal(count || 0)
    }
    setLoadingPending(false)
  }

  const fetchHistoryBatches = async (
    targetPage = historyPage,
    filter = historyFilter
  ) => {
    setLoadingHistory(true)
    const from = (targetPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count, error } = await buildFilteredBatchQuery(filter, false)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      alert(`Gagal memuat riwayat log stok: ${error.message}`)
    } else {
      setHistoryBatches((data || []) as BatchRow[])
      setHistoryTotal(count || 0)
    }
    setLoadingHistory(false)
  }

  useEffect(() => {
    fetchStockMonitor(stockPage)
  }, [stockPage])

  useEffect(() => {
    fetchPendingBatches(pendingPage, pendingFilter)
  }, [pendingPage, pendingFilter])

  useEffect(() => {
    fetchHistoryBatches(historyPage, historyFilter)
  }, [historyPage, historyFilter])

  const updatePendingFilter = (patch: Partial<TableFilterState>) => {
    setPendingPage(1)
    setPendingFilter(prev => ({ ...prev, ...patch }))
  }

  const updateHistoryFilter = (patch: Partial<TableFilterState>) => {
    setHistoryPage(1)
    setHistoryFilter(prev => ({ ...prev, ...patch }))
  }

  const refreshAll = async () => {
    await Promise.all([
      fetchStockMonitor(stockPage),
      fetchPendingBatches(pendingPage, pendingFilter),
      fetchHistoryBatches(historyPage, historyFilter),
    ])
  }

  const handleVerifyAction = async (batchId: string, status: 'approved' | 'rejected') => {
    setBusyId(batchId)
    setFeedback(null)

    const { error } = await supabase
      .from('inventory_batches')
      .update({
        verification_status: status,
        verified_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    setBusyId(null)

    if (error) {
      alert(`Gagal memverifikasi batch: ${error.message}`)
    } else {
      setFeedback(
        status === 'approved'
          ? "Pesanan stock disetujui dan masuk ke stok aktif FIFO."
          : "Pesanan stock ditolak."
      )
      refreshAll()
    }
  }

  const openEditModal = (batch: BatchRow) => {
    setEditingBatch(batch)
    setEditForm({
      material_id: batch.material_id,
      initial_qty: String(batch.initial_qty ?? batch.qty),
      order_date: batch.order_date,
      arrival_date: batch.arrival_date || "",
      supplier: batch.supplier || "",
      verification_status: batch.verification_status,
    })
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBatch) return

    setIsSavingEdit(true)
    setFeedback(null)

    const { error } = await supabase.rpc('update_inventory_batch_log', {
      p_batch_id: editingBatch.id,
      p_material_id: editForm.material_id,
      p_initial_qty: parseFloat(editForm.initial_qty),
      p_order_date: editForm.order_date,
      p_arrival_date: editForm.arrival_date || null,
      p_supplier: editForm.supplier || null,
      p_verification_status: editForm.verification_status,
    })

    setIsSavingEdit(false)

    if (error) {
      alert(`Gagal menyimpan perubahan log: ${error.message}`)
    } else {
      setEditingBatch(null)
      setFeedback("Log pemesanan/kedatangan diperbarui dan sisa stok dihitung ulang.")
      refreshAll()
    }
  }

  const handleDeleteBatch = async (batch: BatchRow) => {
    const meta = getMaterialMeta(batch.materials)
    const ok = window.confirm(
      `Hapus log batch ${meta.name} (${batch.initial_qty} ${meta.unit}, tgl ${batch.order_date})?`
    )
    if (!ok) return

    setBusyId(batch.id)
    setFeedback(null)

    const { error } = await supabase
      .from('inventory_batches')
      .delete()
      .eq('id', batch.id)

    setBusyId(null)

    if (error) {
      alert(`Gagal menghapus log: ${error.message}`)
    } else {
      setFeedback("Log pemesanan/kedatangan berhasil dihapus.")
      refreshAll()
    }
  }

  const renderFilterBar = (
    filter: TableFilterState,
    onChange: (patch: Partial<TableFilterState>) => void,
    onReset: () => void
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-background/40 p-3.5 rounded-2xl border border-border/70 text-xs">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-muted-foreground">Dari Tanggal Pesan</label>
        <input
          type="date"
          value={filter.dateFrom}
          onChange={e => onChange({ dateFrom: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-muted-foreground">Sampai Tanggal Pesan</label>
        <input
          type="date"
          value={filter.dateTo}
          onChange={e => onChange({ dateTo: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-muted-foreground">Produk / Bahan Baku</label>
        <select
          value={filter.materialId}
          onChange={e => onChange({ materialId: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
        >
          <option value="">Semua Produk / Bahan Baku</option>
          {materials.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-muted-foreground">Cari Nama Supplier</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Ketik nama supplier..."
            value={filter.supplierSearch}
            onChange={e => onChange({ supplierSearch: e.target.value })}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
          />
        </div>
      </div>

      <div className="flex items-end">
        <button
          type="button"
          onClick={onReset}
          className="w-full px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <RotateCcw size={13} />
          <span>Reset Filter</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER */}
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white shadow-glow-cyan">
            <Package size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">Manajemen Stock & Log Bahan Baku</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitoring stok terkini, umur batch FIFO, verifikasi input operator, serta riwayat pemesanan & kedatangan.
            </p>
          </div>
        </div>

        {feedback && (
          <div className="px-3.5 py-2 rounded-xl bg-vision-emerald/15 border border-vision-emerald/30 text-vision-emerald text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* TABEL 0: MONITORING STOCK TERKINI */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Layers className="text-vision-cyan" size={18} /> Monitoring Stock Terkini
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sisa stok aktif batch terverifikasi, umur batch fisik untuk memantau FIFO, dan parameter EWS (SS, ROP, EOQ).
            </p>
          </div>
        </div>

        {loadingStock ? (
          <div className="py-10 flex items-center justify-center gap-2 text-vision-cyan text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Memuat monitoring stok terkini...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[980px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Bahan Baku</th>
                  <th className="pb-3 px-3 font-semibold text-right">Stok Saat Ini</th>
                  <th className="pb-3 px-3 font-semibold text-right">Safety Stock</th>
                  <th className="pb-3 px-3 font-semibold text-right">ROP</th>
                  <th className="pb-3 px-3 font-semibold text-right">EOQ</th>
                  <th className="pb-3 px-3 font-semibold text-left">Umur Batch (Fisik)</th>
                  <th className="pb-3 px-3 font-semibold text-center">Status EWS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {stockRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground italic">
                      Belum ada data monitoring stok.
                    </td>
                  </tr>
                ) : (
                  stockRows.map(row => {
                    const currentStock = Number(row.current_stock ?? 0)
                    const ss = row.safety_stock !== undefined && row.safety_stock !== null ? Number(row.safety_stock) : null
                    const rop = row.rop !== undefined && row.rop !== null ? Number(row.rop) : null
                    const eoq = row.eoq !== undefined && row.eoq !== null ? Number(row.eoq) : null
                    const computedStatus =
                      row.ews_status ||
                      (rop !== null && currentStock <= rop
                        ? 'REORDER'
                        : ss !== null && currentStock <= ss
                        ? 'KRITIS'
                        : 'AMAN')

                    const badgeClass =
                      computedStatus.toLowerCase().includes('reorder') || computedStatus.toLowerCase().includes('kritis')
                        ? "bg-vision-rose/15 text-vision-rose border-vision-rose/30"
                        : "bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30"

                    return (
                      <tr key={row.material_id} className="hover:bg-muted/20 transition-colors align-middle">
                        <td className="py-3 px-3 font-bold">{row.name}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-extrabold text-vision-cyan">
                            {currentStock.toLocaleString('id-ID', { maximumFractionDigits: 2 })} {row.monitoring_unit}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Fisik: {row.on_hand_qty.toLocaleString('id-ID', { maximumFractionDigits: 2 })} | Jalan: {row.in_transit_qty.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {ss !== null ? `${ss.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${row.monitoring_unit}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {rop !== null ? `${rop.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${row.monitoring_unit}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {eoq !== null ? `${eoq.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${row.monitoring_unit}` : '-'}
                        </td>
                        <td className="py-3 px-3">
                          {row.batch_ages.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground italic">-</span>
                          ) : (
                            <div className="flex flex-col gap-1.5 max-w-[260px]">
                              {row.batch_ages.map(badge => (
                                <div
                                  key={badge.id}
                                  title={`Qty Awal: ${badge.initialQty} ${row.monitoring_unit} | Sisa Stok: ${badge.remainingQty} ${row.monitoring_unit}`}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-background/70 border border-border/70 text-[11px]"
                                >
                                  <span className="px-1.5 py-0.5 rounded bg-vision-amber/15 text-vision-amber font-bold text-[10px] shrink-0">
                                    {badge.ageDays} Hari lalu
                                  </span>
                                  <span className="font-mono font-bold text-foreground shrink-0">
                                    {badge.remainingQty.toLocaleString('id-ID', { maximumFractionDigits: 2 })} {row.monitoring_unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${badgeClass}`}>
                            {computedStatus}
                          </span>
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
          page={stockPage}
          pageSize={PAGE_SIZE}
          totalCount={stockTotal}
          onPageChange={setStockPage}
        />
      </div>

      {/* TABEL 1: TABEL MASTER VERIFIKASI PESANAN STOCK */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="text-vision-amber" size={18} /> Verifikasi Pesanan Stock (Input Operator)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Setujui atau tolak batch bahan baku yang baru diinput operator sebelum masuk ke perhitungan stok/FIFO.
            </p>
          </div>
        </div>

        {renderFilterBar(
          pendingFilter,
          updatePendingFilter,
          () => {
            setPendingPage(1)
            setPendingFilter(EMPTY_FILTER)
          }
        )}

        {loadingPending ? (
          <div className="py-10 flex items-center justify-center gap-2 text-vision-cyan text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Memuat data verifikasi...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[820px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Bahan Baku</th>
                  <th className="pb-3 px-3 font-semibold text-center">Tgl Pesan</th>
                  <th className="pb-3 px-3 font-semibold text-center">Tgl Tiba</th>
                  <th className="pb-3 px-3 font-semibold text-left">Supplier</th>
                  <th className="pb-3 px-3 font-semibold text-right">Qty</th>
                  <th className="pb-3 px-3 font-semibold text-center">Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {pendingBatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground italic">
                      Tidak ada pesanan stock yang sesuai filter / menunggu verifikasi.
                    </td>
                  </tr>
                ) : (
                  pendingBatches.map(row => {
                    const meta = getMaterialMeta(row.materials)
                    const isRowBusy = busyId === row.id
                    return (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3 font-bold">{meta.name}</td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">{row.order_date}</td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">{row.arrival_date || '-'}</td>
                        <td className="py-3 px-3">{row.supplier || '-'}</td>
                        <td className="py-3 px-3 text-right font-extrabold text-vision-cyan">
                          {Number(row.initial_qty).toLocaleString('id-ID')} {meta.unit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => handleVerifyAction(row.id, 'approved')}
                              className="px-2.5 py-1 rounded-lg bg-vision-emerald/15 border border-vision-emerald/30 text-vision-emerald hover:bg-vision-emerald/25 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              {isRowBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              <span>Setujui</span>
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => handleVerifyAction(row.id, 'rejected')}
                              className="px-2.5 py-1 rounded-lg bg-vision-rose/15 border border-vision-rose/30 text-vision-rose hover:bg-vision-rose/25 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              <XCircle size={12} />
                              <span>Tolak</span>
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
          page={pendingPage}
          pageSize={PAGE_SIZE}
          totalCount={pendingTotal}
          onPageChange={setPendingPage}
        />
      </div>

      {/* TABEL 2: RIWAYAT LOG PEMESANAN & KEDATANGAN (EDIT & HAPUS) */}
      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <History className="text-vision-cyan" size={18} /> Riwayat Log Pemesanan & Kedatangan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edit seluruh kolom (termasuk qty dengan hitung ulang sisa stok) atau hapus log batch.
            </p>
          </div>
        </div>

        {renderFilterBar(
          historyFilter,
          updateHistoryFilter,
          () => {
            setHistoryPage(1)
            setHistoryFilter(EMPTY_FILTER)
          }
        )}

        {loadingHistory ? (
          <div className="py-10 flex items-center justify-center gap-2 text-vision-cyan text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Memuat riwayat log...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[960px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Bahan Baku</th>
                  <th className="pb-3 px-3 font-semibold text-center">Tgl Pesan</th>
                  <th className="pb-3 px-3 font-semibold text-center">Tgl Tiba</th>
                  <th className="pb-3 px-3 font-semibold text-left">Supplier</th>
                  <th className="pb-3 px-3 font-semibold text-right">Qty Awal</th>
                  <th className="pb-3 px-3 font-semibold text-right">Sisa Stok</th>
                  <th className="pb-3 px-3 font-semibold text-center">Status</th>
                  <th className="pb-3 px-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {historyBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground italic">
                      Tidak ada riwayat log pemesanan & kedatangan yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  historyBatches.map(row => {
                    const meta = getMaterialMeta(row.materials)
                    const isRowBusy = busyId === row.id

                    const statusBadge =
                      row.verification_status === 'approved'
                        ? "bg-vision-emerald/15 text-vision-emerald border-vision-emerald/30"
                        : row.verification_status === 'rejected'
                        ? "bg-vision-rose/15 text-vision-rose border-vision-rose/30"
                        : "bg-vision-amber/15 text-vision-amber border-vision-amber/30"

                    return (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3 font-bold">{meta.name}</td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">{row.order_date}</td>
                        <td className="py-3 px-3 text-center font-mono text-[11px]">{row.arrival_date || '-'}</td>
                        <td className="py-3 px-3">{row.supplier || '-'}</td>
                        <td className="py-3 px-3 text-right font-semibold">
                          {Number(row.initial_qty).toLocaleString('id-ID')} {meta.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-vision-cyan">
                          {Number(row.qty).toLocaleString('id-ID')} {meta.unit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${statusBadge}`}>
                            {row.verification_status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => openEditModal(row)}
                              className="px-2.5 py-1 rounded-lg bg-vision-blue/15 border border-vision-blue/30 text-vision-blue hover:bg-vision-blue/25 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              <Pencil size={12} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => handleDeleteBatch(row)}
                              className="px-2.5 py-1 rounded-lg bg-vision-rose/15 border border-vision-rose/30 text-vision-rose hover:bg-vision-rose/25 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              {isRowBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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
          page={historyPage}
          pageSize={PAGE_SIZE}
          totalCount={historyTotal}
          onPageChange={setHistoryPage}
        />
      </div>

      {/* MODAL EDIT LOG PEMESANAN & KEDATANGAN */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="vision-glass w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/50 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vision-blue/20 text-vision-blue flex items-center justify-center">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Edit Log Pemesanan & Kedatangan</h3>
                  <p className="text-xs text-muted-foreground">
                    Perubahan qty akan otomatis menghitung ulang sisa stok batch.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Bahan Baku</label>
                  <select
                    required
                    value={editForm.material_id}
                    onChange={e => setEditForm({ ...editForm, material_id: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                  >
                    {materials.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.monitoring_unit})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Qty (Jumlah Awal Batch)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={editForm.initial_qty}
                    onChange={e => setEditForm({ ...editForm, initial_qty: e.target.value })}
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
                    value={editForm.order_date}
                    onChange={e => setEditForm({ ...editForm, order_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Tanggal Tiba</label>
                  <input
                    type="date"
                    value={editForm.arrival_date}
                    onChange={e => setEditForm({ ...editForm, arrival_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:border-vision-cyan outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Supplier</label>
                  <input
                    type="text"
                    value={editForm.supplier}
                    onChange={e => setEditForm({ ...editForm, supplier: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Status Verifikasi</label>
                  <select
                    value={editForm.verification_status}
                    onChange={e => setEditForm({ ...editForm, verification_status: e.target.value as VerificationStatus })}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground font-semibold focus:border-vision-cyan outline-none"
                  >
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-vision-cyan to-vision-blue text-white font-extrabold flex items-center gap-2 shadow-glow-cyan hover:opacity-90 disabled:opacity-50"
                >
                  {isSavingEdit ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
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