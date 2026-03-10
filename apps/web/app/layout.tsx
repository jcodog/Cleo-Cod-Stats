import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"
import { Toaster } from "@workspace/ui/components/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { ClerkProvider } from "@/components/providers/ClerkProvider"
import ConvexClientProvider from "@/components/providers/ConvexProviderWithClerk"
import { TanstackQueryProvider } from "@/components/providers/TanstackQueryProvider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

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
      className={cn( fontMono.variable, "font-sans", inter.variable)}
    >
      <body className="flex h-full min-h-screen w-full min-w-full flex-col antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <ClerkProvider>
              <ConvexClientProvider>
                <TanstackQueryProvider>
                  {children}
                  <Toaster richColors position="top-right" closeButton />
                </TanstackQueryProvider>
              </ConvexClientProvider>
            </ClerkProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
