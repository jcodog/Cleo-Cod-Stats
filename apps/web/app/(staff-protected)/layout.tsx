import { AppAuthGate } from "@/features/auth/components/AppAuthGate"

export default function StaffProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <AppAuthGate>{children}</AppAuthGate>
}
