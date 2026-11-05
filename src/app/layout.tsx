import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Konfigurasi Font Plus Jakarta Sans
const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Sistem Informasi UMKM Mie Kurnia Jaya",
  description: "Sistem Manajemen Persediaan & Keuangan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} font-sans antialiased bg-vision-bg text-foreground transition-colors duration-300`}>
        <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange={false} enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}