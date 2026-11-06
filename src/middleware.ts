import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Inisialisasi Supabase client untuk middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Memperbarui sesi auth jika kadaluwarsa
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()

  // Proteksi Rute: Jika belum login dan mencoba mengakses /dashboard, lempar ke /login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Jika sudah login dan mencoba mengakses /login, arahkan langsung ke /dashboard
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Konfigurasi path mana saja yang akan dipantau oleh middleware
export const config = {
  matcher: [
    /*
     * Match semua request path kecuali untuk:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (.svg, .png, .jpg, dll)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}