'use client'

import { useState, useEffect, useMemo } from "react"
import { ShieldCheck, Loader2, Users, CheckCircle2, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"

type UserRole = 'owner' | 'admin' | 'operator'

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

  const fetchProfiles = async () => {
    setIsLoading(true)
    const [{ data: authData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: true })
    ])

    if (authData?.user) {
      setCurrentUserId(authData.user.id)
    }

    if (error) {
      alert(`Gagal memuat daftar akun: ${error.message}`)
    } else if (data) {
      setProfiles(data as ProfileRow[])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

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
      setProfiles(prev => prev.filter(item => item.id !== user.id))
      setFeedback(`Data pengguna "${label}" berhasil dihapus.`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-3 text-vision-cyan">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-xs font-bold animate-pulse">Memuat Master Akun...</p>
      </div>
    )
  }

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
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Users className="text-vision-cyan" size={18} /> Tabel Master Akun
          </h3>
          <span className="text-xs text-muted-foreground font-semibold">
            Total Akun: {profiles.length}
          </span>
        </div>

        <div className="overflow-x-auto">
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
              {profiles.map(user => {
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}