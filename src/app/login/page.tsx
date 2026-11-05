'use client'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useTheme } from "next-themes"
import { Eye, EyeOff, Soup, ArrowRight, UserPlus, LogIn, Sun, Moon } from "lucide-react"

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)

  // State Form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Auth login menggunakan email. Di mockup menggunakan "Username atau Email".
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(`Login Gagal: ${error.message}`) // Nanti bisa diganti dengan Shadcn Toast
    } else {
      router.push('/dashboard') // Redirect ke Dashboard
    }
    setIsLoading(false)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // 1. Daftar Auth User di Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone,
        }
      }
    })

    if (authError) {
      alert(`Registrasi Gagal: ${authError.message}`)
    } else {
      alert('Registrasi Berhasil! Silakan cek email Anda (jika email confirmation aktif), atau langsung login.')
      setActiveTab('login')
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-vision-bg text-foreground flex flex-col relative overflow-hidden transition-colors duration-300">
      {/* Tombol Tema */}
      {mounted && (
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="absolute top-6 right-6 p-2 rounded-full bg-vision-card border border-border shadow-sm z-50 hover:bg-muted"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-vision-amber" />
          ) : (
            <Moon className="w-5 h-5 text-vision-purple" />
          )}
        </button>
      )}

      {/* Orbs Background (hanya untuk dekorasi - persis seperti mockup) */}
      <div className="absolute w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(6,182,212,0.2)_0%,transparent_70%)] -top-[120px] -left-[150px] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute w-[650px] h-[650px] bg-[radial-gradient(circle,rgba(59,130,246,0.15)_0%,transparent_70%)] -bottom-[150px] -right-[100px] rounded-full blur-3xl pointer-events-none" />

      {/* Header Kecil */}
      <header className="w-full max-w-[1600px] mx-auto px-6 py-5 flex items-center gap-3 relative z-10">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-vision-cyan via-vision-blue to-vision-purple flex items-center justify-center shadow-glow-cyan text-white">
          <Soup size={24} />
        </div>
        <span className="font-extrabold text-xl tracking-tight leading-none text-foreground">MIE KURNIA JAYA</span>
      </header>

      {/* Konten Utama */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        
        {/* Left Side: Copywriting */}
        <div className="lg:col-span-7 space-y-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-none text-foreground">
            Mie Kurnia Jaya
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple">
            Sistem Informasi Persediaan & Keuangan
          </h2>
          <div className="bg-vision-card/70 backdrop-blur-xl p-6 rounded-3xl border border-border shadow-sm">
             <p className="text-muted-foreground text-sm leading-relaxed">
              <span className="text-foreground font-semibold">UMKM Mie Kurnia Jaya</span> merupakan produsen mie basah dan kering berkualitas tinggi. Sistem informasi terintegrasi ini dirancang untuk memantau stok bahan baku, manajemen produksi harian, serta pencatatan keuangan real-time.
            </p>
          </div>
        </div>

        {/* Right Side: Auth Card */}
        <div className="lg:col-span-5 w-full max-w-md mx-auto">
          <div className="bg-vision-card/80 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-border shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple" />

            {/* Tab Switcher */}
            <div className="flex bg-muted p-1.5 rounded-2xl mb-6">
              <button 
                onClick={() => setActiveTab('login')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'login' ? 'bg-gradient-to-r from-vision-cyan to-vision-blue text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <LogIn size={16} /> Masuk
              </button>
              <button 
                onClick={() => setActiveTab('register')}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'register' ? 'bg-gradient-to-r from-vision-emerald to-vision-cyan text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <UserPlus size={16} /> Daftar
              </button>
            </div>

            {/* Form Login */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email</label>
                  <input 
                    type="email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-sm focus:border-vision-cyan focus:ring-1 focus:ring-vision-cyan outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-semibold text-foreground">Password</label>
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border text-sm focus:border-vision-cyan focus:ring-1 focus:ring-vision-cyan outline-none transition-all pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[34px] text-muted-foreground hover:text-vision-cyan">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button 
                  disabled={isLoading}
                  type="submit" 
                  className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-vision-cyan via-vision-blue to-vision-purple text-white font-bold text-sm shadow-glow-cyan hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? 'Memproses...' : <>LOGIN SEKARANG <ArrowRight size={16} /></>}
                </button>
              </form>
            )}

            {/* Form Register */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Nama Lengkap</label>
                  <input 
                    type="text" 
                    required 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-vision-emerald focus:ring-1 focus:ring-vision-emerald outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email</label>
                  <input 
                    type="email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-vision-emerald focus:ring-1 focus:ring-vision-emerald outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-semibold text-foreground">Password (Min 6 Karakter)</label>
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    required 
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-vision-emerald focus:ring-1 focus:ring-vision-emerald outline-none transition-all pr-10"
                  />
                   <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[34px] text-muted-foreground hover:text-vision-emerald">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button 
                  disabled={isLoading}
                  type="submit" 
                  className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-vision-emerald to-vision-cyan text-white font-bold text-sm shadow-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? 'Memproses...' : 'DAFTAR AKUN BARU'}
                </button>
              </form>
            )}
            
          </div>
        </div>

      </main>
    </div>
  )
}