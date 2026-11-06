'use client'

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase"
import {
  Soup, LogOut, PieChart, Package, ListTodo,
  Calculator, Settings, Sun, Moon,
  type LucideIcon,
} from "lucide-react"

import BerandaTab from "@/components/dashboard/BerandaTab"
import SettingTab from "@/components/dashboard/SettingTab"
import StockTab from "@/components/dashboard/StockTab"
import OrdersTab from "@/components/dashboard/OrderTab"
import FinanceTab from "@/components/dashboard/FinanceTab"

/* ========================================================================== */
/* TYPES & DATA                                                               */
/* ========================================================================== */

type TabType = 'beranda' | 'stock' | 'pesanan' | 'keuangan' | 'setting'

const NAV_ITEMS: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: 'beranda', label: 'Beranda', icon: PieChart },
  { id: 'stock', label: 'Stock', icon: Package },
  { id: 'pesanan', label: 'Pesanan', icon: ListTodo },
  { id: 'keuangan', label: 'Keuangan', icon: Calculator },
  { id: 'setting', label: 'Setting', icon: Settings },
]

/* ========================================================================== */
/* SMALL COMPONENTS                                                           */
/* ========================================================================== */

function ThemeToggle({
  className,
  iconSize,
  mounted,
}: {
  className: string
  iconSize: number
  mounted: boolean
}) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      aria-label="Ganti tema"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={className}
    >
      {/* Placeholder dengan ukuran sama mencegah layout shift & mismatch hydration */}
      {!mounted ? (
        <span className="block" style={{ width: iconSize, height: iconSize }} />
      ) : isDark ? (
        <Sun size={iconSize} className="text-vision-amber" />
      ) : (
        <Moon size={iconSize} className="text-vision-purple" />
      )}
    </button>
  )
}

function ModulePlaceholder({ tab }: { tab: TabType }) {
  return (
    <div className="vision-glass p-6 sm:p-12 rounded-3xl text-center animate-in fade-in duration-300">
      <h3 className="text-lg sm:text-xl font-bold text-foreground capitalize mb-2">Modul {tab}</h3>
      <p className="text-muted-foreground text-sm sm:text-base">
        Konten untuk modul ini akan dibangun pada tahap berikutnya.
      </p>
    </div>
  )
}

/* ========================================================================== */
/* PAGE                                                                       */
/* ========================================================================== */

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('beranda')
  const [mounted, setMounted] = useState(false)
  const [username, setUsername] = useState<string>("Loading...")
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: {user}, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        router.push('/login')
        return
      }

    const displayName = user.user_metadata?.full_name

    setUsername(displayName || 'User')
    }
    fetchUserProfile()
  }, [supabase, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 relative overflow-hidden">

      {/* Dekorasi Orbs (Terlihat jelas di Dark Mode) */}
      <div className="absolute w-[360px] h-[360px] sm:w-[600px] sm:h-[600px] bg-[radial-gradient(circle,rgba(6,182,212,0.15)_0%,transparent_70%)] -top-[80px] -left-[100px] sm:-top-[120px] sm:-left-[150px] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* HEADER & TASKBAR */}
      <header className="vision-glass p-4 sm:p-5 rounded-3xl flex flex-col xl:flex-row items-center justify-between gap-4 relative z-10">

        {/* Logo & User */}
        <div className="flex items-center justify-between w-full xl:w-auto gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white shadow-glow-cyan">
              <Soup size={24} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none text-foreground truncate">MIE KURNIA JAYA</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                User: <strong className="text-vision-cyan">{username}</strong>
              </p>
            </div>
          </div>

          {/* Aksi untuk mobile / tablet */}
          <div className="flex items-center gap-2 xl:hidden shrink-0">
            <ThemeToggle
              mounted={mounted}
              iconSize={20}
              className="p-2 rounded-full bg-vision-card border border-border shadow-sm hover:bg-muted"
            />
            <button
              type="button"
              aria-label="Keluar"
              onClick={handleLogout}
              className="p-2 rounded-xl bg-vision-rose/10 text-vision-rose border border-vision-rose/20"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* TASKBAR NAVIGASI UTAMA */}
        <nav className="grid grid-cols-5 sm:flex sm:flex-wrap items-center justify-center gap-1 sm:gap-1.5 bg-background/50 p-1.5 rounded-2xl border border-border w-full xl:w-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-extrabold text-[10px] sm:text-xs transition-all duration-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2
                  ${isActive ? 'bg-gradient-to-r from-vision-cyan to-vision-blue text-white shadow-glow-cyan' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden xl:flex items-center gap-3">
          <ThemeToggle
            mounted={mounted}
            iconSize={18}
            className="p-2.5 rounded-xl vision-glass text-muted-foreground hover:text-foreground transition-colors"
          />
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2.5 rounded-xl bg-vision-rose/10 border border-vision-rose/30 text-vision-rose hover:bg-vision-rose/20 text-xs font-bold transition-all flex items-center gap-2"
          >
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </header>

      {/* CONTAINER KONTEN MODUL */}
      <main className="w-full max-w-[1600px] mx-auto flex-1 relative z-10">
        {/* {activeTab === 'beranda' ? <BerandaTab /> : <ModulePlaceholder tab={activeTab} />} */}
        {activeTab === 'beranda' && <BerandaTab />}
        {activeTab === 'setting' && <SettingTab />}
        {activeTab === 'stock' && <StockTab />}
        {activeTab === 'pesanan' && <OrdersTab />}
        {activeTab === 'keuangan' && <FinanceTab />}
      </main>
    </div>
  )
}