'use client'

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  ShieldCheck, Loader2, Users, CheckCircle2, Trash2,
  Search, ChevronLeft, ChevronRight, RotateCcw
} from "lucide-react"
import { createClient } from "@/lib/supabase"

type UserRole = 'owner' | 'admin' | 'operator'
type RoleFilter = 'all' | UserRole

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  created_at: string
}

export default function ControlUserTab() {
  const supabase = useMemo(() => createClient(), [])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // State Filter & Paginasi Server-Side
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)

  // Debounce input pencarian agar query server-side tidak terpanggil tiap ketukan
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      setSearchQuery(searchInput.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Ambil user aktif sekali saat mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id)
    })
  }, [supabase])

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at', { count: 'exact' })

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter)
    }

    if (searchQuery) {
      const escaped = searchQuery.replace(/[%_,]/g, '')
      if (escaped) {
        query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      }
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: true })
      .range(from, to)

    if (error) {
      alert(`Gagal memuat daftar akun: ${error.message}`)
    } else {
      const nextCount = count ?? 0
      const maxPage = Math.max(1, Math.ceil(nextCount / pageSize))

      if (page > maxPage) {
        setTotalCount(nextCount)
        setPage(maxPage)
        setIsLoading(false)
        return
      }

      setProfiles((data as ProfileRow[]) || [])
      setTotalCount(nextCount)
    }

    setIsLoading(false)
  }, [supabase, page, pageSize, roleFilter, searchQuery])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId)
    setFeedback(null)

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)

    setUpdatingId(null)

    if (error) {
      alert(`Gagal mengubah role: ${error.message}`)
    } else {
      setProfiles(prev =>
        prev.map(item => (item.id === userId ? { ...item, role: newRole } : item))
      )
      setFeedback(`Role berhasil diperbarui menjadi "${newRole.toUpperCase()}".`)
      if (roleFilter !== 'all' && roleFilter !== newRole) {
        fetchProfiles()
      }
    }
  }

  const handleDeleteUser = async (user: ProfileRow) => {
    if (user.id === currentUserId) {
      return alert("Akun yang sedang Anda gunakan tidak dapat dihapus dari daftar ini.")
    }

    const label = user.email || user.full_name || user.id
    const confirmed = window.confirm(
      `Yakin ingin menghapus data pengguna "${label}" dari tabel master akun?`
    )
    if (!confirmed) return

    setDeletingId(user.id)
    setFeedback(null)

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id)

    setDeletingId(null)

    if (error) {
      alert(`Gagal menghapus pengguna: ${error.message}`)
    } else {
      setFeedback(`Data pengguna "${label}" berhasil dihapus.`)
      await fetchProfiles()
    }
  }

  const handleResetFilters = () => {
    setSearchInput("")
    setSearchQuery("")
    setRoleFilter('all')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const startRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(totalCount, page * pageSize)
  const hasActiveFilter = Boolean(searchQuery) || roleFilter !== 'all'

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="vision-glass p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white shadow-glow-cyan">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">Control User & Hak Akses</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola role akun terdaftar (akun baru otomatis berstatus Operator).
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

      <div className="vision-glass p-6 rounded-3xl space-y-4 shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Users className="text-vision-cyan" size={18} /> Tabel Master Akun
          </h3>
          <span className="text-xs text-muted-foreground font-semibold">
            {totalCount === 0
              ? "Menampilkan 0 akun"
              : `Menampilkan ${startRow}–${endRow} dari ${totalCount} akun`}
          </span>
        </div>

        {/* Bar Filterisasi Data */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Cari nama pengguna atau email..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-medium focus:border-vision-cyan outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={e => {
                setRoleFilter(e.target.value as RoleFilter)
                setPage(1)
              }}
              aria-label="Filter berdasarkan role"
              className="px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-bold focus:border-vision-cyan outline-none"
            >
              <option value="all">Semua Role</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
            </select>

            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              aria-label="Jumlah baris per halaman"
              className="px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-bold focus:border-vision-cyan outline-none"
            >
              <option value={5}>5 / hal</option>
              <option value={10}>10 / hal</option>
              <option value={20}>20 / hal</option>
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-border text-foreground text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabel Data */}
        <div className="overflow-x-auto min-h-[220px] relative">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-vision-cyan">
              <Loader2 className="w-7 h-7 animate-spin" />
              <p className="text-xs font-bold animate-pulse">Memuat Data Akun...</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse min-w-[780px]">
              <thead className="text-muted-foreground border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="pb-3 px-3 font-semibold text-left">Nama Pengguna</th>
                  <th className="pb-3 px-3 font-semibold text-left">Email</th>
                  <th className="pb-3 px-3 font-semibold text-center">Role Aktif</th>
                  <th className="pb-3 px-3 font-semibold text-center">Ubah Role</th>
                  <th className="pb-3 px-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-foreground">
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground italic">
                      {hasActiveFilter
                        ? "Tidak ada akun yang cocok dengan filter yang dipilih."
                        : "Belum ada akun terdaftar."}
                    </td>
                  </tr>
                ) : (
                  profiles.map(user => {
                    const isSelf = user.id === currentUserId
                    const isBusy = updatingId === user.id || deletingId === user.id

                    const badgeStyle =
                      user.role === 'owner'
                        ? "bg-vision-purple/15 text-vision-purple border-vision-purple/30"
                        : user.role === 'admin'
                        ? "bg-vision-blue/15 text-vision-blue border-vision-blue/30"
                        : "bg-vision-amber/15 text-vision-amber border-vision-amber/30"

                    return (
                      <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3 font-bold">{user.full_name || '-'}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                          {user.email || '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase ${badgeStyle}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <select
                            disabled={isBusy}
                            value={user.role}
                            onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
                            className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-bold text-xs focus:border-vision-cyan outline-none disabled:opacity-50"
                          >
                            <option value="operator">Operator</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            disabled={isBusy || isSelf}
                            onClick={() => handleDeleteUser(user)}
                            title={isSelf ? "Tidak dapat menghapus akun sendiri" : "Hapus pengguna"}
                            className="px-2.5 py-1.5 rounded-xl bg-vision-rose/10 border border-vision-rose/30 text-vision-rose hover:bg-vision-rose/20 font-bold text-[11px] inline-flex items-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {deletingId === user.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            <span>Hapus</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Kontrol Paginasi Server-Side */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border text-xs">
          <span className="text-muted-foreground font-medium">
            Halaman <strong className="text-foreground">{page}</strong> dari{" "}
            <strong className="text-foreground">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-bold inline-flex items-center gap-1 hover:border-vision-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
              <span>Sebelumnya</span>
            </button>

            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(pageNum => (
                <button
                  key={pageNum}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-xl font-bold text-xs transition-colors ${
                    pageNum === page
                      ? "bg-vision-cyan/20 text-vision-cyan border border-vision-cyan/40"
                      : "bg-background border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-bold inline-flex items-center gap-1 hover:border-vision-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Berikutnya</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}