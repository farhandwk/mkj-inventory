'use client'

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase"
import {
  LogOut, PieChart, Package, ListTodo,
  Calculator, Settings, Sun, Moon, ShieldCheck,
  PackagePlus, Loader2,
  type LucideIcon,
} from "lucide-react"

import BerandaTab from "@/components/dashboard/BerandaTab"
import SettingTab from "@/components/dashboard/SettingTab"
import StockTab from "@/components/dashboard/StockTab"
import OrdersTab from "@/components/dashboard/OrderTab"
import FinanceTab from "@/components/dashboard/FinanceTab"
import ControlUserTab from "@/components/dashboard/ControlUserTab"
import OperatorInputTab from "@/components/dashboard/OperatorInputTab"

/* ========================================================================== */
/* TYPES & DATA                                                               */
/* ========================================================================== */

type UserRole = 'owner' | 'admin' | 'operator'

type TabType =
  | 'beranda'
  | 'stock'
  | 'pesanan'
  | 'keuangan'
  | 'setting'
  | 'control_user'
  | 'operator_input'

type NavItem = {
  id: TabType
  label: string
  icon: LucideIcon
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { id: 'beranda', label: 'Beranda', icon: PieChart, roles: ['owner'] },
  { id: 'stock', label: 'Stock', icon: Package, roles: ['owner'] },
  { id: 'pesanan', label: 'Pesanan', icon: ListTodo, roles: ['owner', 'operator'] },
  { id: 'keuangan', label: 'Keuangan', icon: Calculator, roles: ['owner'] },
  { id: 'setting', label: 'Setting', icon: Settings, roles: ['owner'] },
  { id: 'control_user', label: 'Control User', icon: ShieldCheck, roles: ['owner'] },
  { id: 'operator_input', label: 'Input Data', icon: PackagePlus, roles: ['owner', 'admin'] },
]

function getDefaultTabForRole(role: UserRole): TabType {
  if (role === 'admin') return 'operator_input'
  if (role === 'operator') return 'pesanan'
  return 'beranda'
}

function isTabAllowedForRole(tab: TabType, role: UserRole): boolean {
  const item = NAV_ITEMS.find(nav => nav.id === tab)
  return item ? item.roles.includes(role) : false
}

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

/* ========================================================================== */
/* PAGE                                                                       */
/* ========================================================================== */

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('beranda')
  const [mounted, setMounted] = useState(false)
  const [username, setUsername] = useState<string>("Loading...")
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchUserProfile = async () => {
      setIsAuthChecking(true)
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      const resolvedRole: UserRole =
        profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'operator'
          ? profile.role
          : 'operator'

      const displayName =
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'User'

      setUsername(displayName)
      setUserRole(resolvedRole)
      setActiveTab(prev =>
        isTabAllowedForRole(prev, resolvedRole) ? prev : getDefaultTabForRole(resolvedRole)
      )
      setIsAuthChecking(false)
    }

    fetchUserProfile()
  }, [supabase, router])

  const handleSelectTab = (tab: TabType) => {
    if (!userRole || !isTabAllowedForRole(tab, userRole)) return
    setActiveTab(tab)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleNavItems = useMemo(() => {
    if (!userRole) return []
    return NAV_ITEMS.filter(item => item.roles.includes(userRole))
  }, [userRole])

  const effectiveTab: TabType = useMemo(() => {
    if (!userRole) return 'beranda'
    return isTabAllowedForRole(activeTab, userRole)
      ? activeTab
      : getDefaultTabForRole(userRole)
  }, [activeTab, userRole])

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 relative overflow-hidden">

      {/* Dekorasi Orbs (Terlihat jelas di Dark Mode) */}
      <div className="absolute w-[360px] h-[360px] sm:w-[600px] sm:h-[600px] bg-[radial-gradient(circle,rgba(6,182,212,0.15)_0%,transparent_70%)] -top-[80px] -left-[100px] sm:-top-[120px] sm:-left-[150px] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* HEADER & TASKBAR */}
      <header className="vision-glass p-4 sm:p-5 rounded-3xl flex flex-col xl:flex-row items-center justify-between gap-4 relative z-10 print:hidden">

        {/* Logo & User */}
        <div className="flex items-center justify-between w-full xl:w-auto gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-tr from-vision-cyan to-vision-blue flex items-center justify-center text-white shadow-glow-cyan overflow-hidden p-1">
              <Image
                src="/logo-mkj.png"
                alt="logo Mie Kurnia Jaya"
                width={44}
                height={44}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-none text-foreground truncate">MIE KURNIA JAYA</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                User: <strong className="text-vision-cyan">{username}</strong>
                {userRole && (
                  <span className="ml-2 px-2 py-0.5 rounded-md bg-vision-cyan/15 text-vision-cyan font-bold uppercase text-[10px]">
                    {userRole}
                  </span>
                )}
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
        <nav className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 bg-background/50 p-1.5 rounded-2xl border border-border w-full xl:w-auto">
          {visibleNavItems.map(({ id, label, icon: Icon }) => {
            const isActive = effectiveTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl font-extrabold text-[10px] sm:text-xs transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2
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
        {isAuthChecking || !userRole ? (
          <div className="flex flex-col items-center justify-center h-[50vh] space-y-3 text-vision-cyan">
            <Loader2 className="w-9 h-9 animate-spin" />
            <p className="text-xs font-bold animate-pulse">Memverifikasi Hak Akses...</p>
          </div>
        ) : (
          <>
            {effectiveTab === 'beranda' && isTabAllowedForRole('beranda', userRole) && <BerandaTab />}
            {effectiveTab === 'setting' && isTabAllowedForRole('setting', userRole) && <SettingTab />}
            {effectiveTab === 'stock' && isTabAllowedForRole('stock', userRole) && <StockTab />}
            {effectiveTab === 'pesanan' && isTabAllowedForRole('pesanan', userRole) && <OrdersTab />}
            {effectiveTab === 'keuangan' && isTabAllowedForRole('keuangan', userRole) && <FinanceTab />}
            {effectiveTab === 'control_user' && userRole === 'owner' && <ControlUserTab />}
            {effectiveTab === 'operator_input' && isTabAllowedForRole('operator_input', userRole) && <OperatorInputTab />}
          </>
        )}
      </main>
    </div>
  )
}