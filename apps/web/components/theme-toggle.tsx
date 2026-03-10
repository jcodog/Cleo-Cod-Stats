"use client"

import { useEffect, useState } from "react"
import { IconMoonStars, IconSunHigh } from "@tabler/icons-react"
import { useTheme } from "next-themes"

import { Button } from "@workspace/ui/components/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <Button
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      size="icon-sm"
      variant="outline"
    >
      {isDark ? <IconSunHigh aria-hidden="true" /> : <IconMoonStars aria-hidden="true" />}
    </Button>
  )
}
