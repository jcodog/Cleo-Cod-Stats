import { AppShell } from "@/components/app-shell/AppShell"
import { AppAuthGate } from "@/features/auth/components/AppAuthGate"

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AppAuthGate>
      <AppShell>{children}</AppShell>
    </AppAuthGate>
  )
}
