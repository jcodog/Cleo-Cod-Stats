"use client"

export function AppShellLoadingView() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="hidden items-center gap-2 md:flex">
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-10 w-52 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-3xl border border-border/70 bg-card/80" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-36 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
          <div className="h-36 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
        </div>
      </div>
    </div>
  )
}
