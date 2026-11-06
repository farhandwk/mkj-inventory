'use client'

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase"
import {
  Soup, LogOut, PieChart, Package, ListTodo,
  Calculator, Settings, Sun, Moon, TrendingUp,
  PackageOpen, Receipt, Crown,
  type LucideIcon,
} from "lucide-react"

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

type KpiCardData = {
  label: string
  value: string
  icon: LucideIcon
  valueSize: string
  // Class ditulis lengkap agar terdeteksi oleh Tailwind saat build
  borderClass: string
  textClass: string
  iconBoxClass: string
}

const KPI_CARDS: KpiCardData[] = [
  {
    label: 'Total Penjualan',
    value: 'Rp 48.500.000',
    icon: TrendingUp,
    valueSize: 'text-xl sm:text-2xl',
    borderClass: 'border-l-vision-cyan',
    textClass: 'text-vision-cyan',
    iconBoxClass: 'bg-vision-cyan/20 text-vision-cyan',
  },
  {
    label: 'Produk Terjual',
    value: '2.450 Qty',
    icon: PackageOpen,
    valueSize: 'text-xl sm:text-2xl',
    borderClass: 'border-l-vision-purple',
    textClass: 'text-vision-purple',
    iconBoxClass: 'bg-vision-purple/20 text-vision-purple',
  },
  {
    label: 'Pesanan Selesai',
    value: '312 Transaksi',
    icon: Receipt,
    valueSize: 'text-xl sm:text-2xl',
    borderClass: 'border-l-vision-emerald',
    textClass: 'text-vision-emerald',
    iconBoxClass: 'bg-vision-emerald/20 text-vision-emerald',
  },
  {
    label: 'Produk Terlaris',
    value: 'Mie Telur Ayam',
    icon: Crown,
    valueSize: 'text-lg',
    borderClass: 'border-l-vision-amber',
    textClass: 'text-vision-amber',
    iconBoxClass: 'bg-vision-amber/20 text-vision-amber',
  },
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

function KpiCard({ label, value, icon: Icon, valueSize, borderClass, textClass, iconBoxClass }: KpiCardData) {
  return (
    <div className={`vision-glass p-4 sm:p-5 rounded-2xl border-l-4 ${borderClass} relative overflow-hidden`}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
          <h3 className={`${valueSize} font-black ${textClass} mt-1 truncate`}>{value}</h3>
        </div>
        <div className={`w-10 h-10 shrink-0 rounded-2xl ${iconBoxClass} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function BerandaTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header Beranda */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 vision-glass p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <PieChart className="text-vision-cyan shrink-0" size={18} /> Dashboard Utama Beranda
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ringkasan performa penjualan dan kontribusi produk secara real-time.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* Placeholder untuk Grafik & Tabel (Dikerjakan di milestone berikutnya) */}
      <div className="vision-glass p-6 sm:p-12 rounded-3xl text-center border-dashed border-2 border-border/50">
        <p className="text-muted-foreground font-medium text-sm sm:text-base">
          Area ini akan diisi dengan integrasi Chart.js dan Tabel Data Penjualan pada milestone selanjutnya.
        </p>
      </div>

    </div>
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