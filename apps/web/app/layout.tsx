import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"
import { Toaster } from "@workspace/ui/components/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { ClerkProvider } from "@/components/providers/ClerkProvider"
import ConvexClientProvider from "@/components/providers/ConvexProviderWithClerk"
import { TanstackQueryProvider } from "@/components/providers/TanstackQueryProvider"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "CodStats",
  description: "Call of Duty ranked statistics powered by Cleo.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(inter.variable, fontMono.variable)}
    >
      <body className="flex min-h-screen min-w-full h-full w-full flex-col antialiased">
        <ThemeProvider>
          <ClerkProvider>
            <ConvexClientProvider>
              <TanstackQueryProvider>
                {children}
                <Toaster richColors position="top-right" />
              </TanstackQueryProvider>
            </ConvexClientProvider>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
