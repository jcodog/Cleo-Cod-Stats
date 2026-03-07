import Link from "next/link";

import { LandingLiveStats } from "@/components/landing/live-stats";
import { NavbarAuthActions } from "@/components/landing/navbar-auth-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";

const featureCards = [
  {
    title: "Session Timeline",
    description:
      "See outcomes, SR movement, K/D shifts, and pacing across recent sessions in one clear view.",
  },
  {
    title: "Progress Signals",
    description:
      "Track consistency, identify breakout matches, and spot when momentum starts slipping.",
  },
  {
    title: "Better Adjustments",
    description:
      "Make smarter changes to loadouts, queue windows, and routines based on what your data shows.",
  },
] as const;

const workflow = [
  {
    step: "Connect",
    detail:
      "Sign in once to start tracking and keep everything tied to your account.",
  },
  {
    step: "Review",
    detail:
      "Scan sessions, modes, and SR trends with a clean dashboard built for speed.",
  },
  {
    step: "Improve",
    detail: "Adjust before the next queue, then measure the results over time.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col bg-background [font-family:var(--font-geist-sans)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md px-3 py-2 focus-visible:not-sr-only focus-visible:absolute focus-visible:left-3 focus-visible:top-3 focus-visible:bg-background focus-visible:text-foreground focus-visible:shadow-md"
      >
        Skip to Main Content
      </a>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-[130%] rounded-full bg-sky-200/45 blur-3xl" />
        <div className="absolute -top-16 left-1/2 h-112 w-md -translate-x-[10%] rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute -right-40 top-64 h-80 w-80 rounded-full bg-blue-100/55 blur-3xl" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="h-7 w-7 overflow-hidden rounded-md bg-primary/10 after:hidden">
              <AvatarImage
                src="/logo.png"
                alt="CodStats logo"
                className="rounded-none object-cover"
              />
              <AvatarFallback className="rounded-none text-[0.65rem] font-semibold">
                CS
              </AvatarFallback>
            </Avatar>
            CodStats
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
          >
            <Link
              href="#features"
              className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              How It Works
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <NavbarAuthActions />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-20 sm:px-6 sm:pt-24 lg:px-8"
      >
        <section className="grid items-center gap-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 lg:grid-cols-2">
          <div className="min-w-0 space-y-8">
            <p className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Built for Ranked COD Players
            </p>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Track Every Match. Learn Faster. Win More.
              </h1>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                CodStats turns ranked sessions into a clear performance view so
                you can spot patterns and improve faster.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-10 px-5 text-sm">
                <Link href="#features">Explore Features</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-10 px-5 text-sm"
              >
                <Link href="#how-it-works">See How It Works</Link>
              </Button>
            </div>
          </div>

          <aside className="min-w-0 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur">
            <div className="inline-flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2">
              <Avatar className="h-10 w-10 overflow-hidden rounded-lg bg-primary/10 after:hidden">
                <AvatarImage
                  src="/logo.png"
                  alt="CodStats logo"
                  className="rounded-none object-cover"
                />
                <AvatarFallback className="rounded-none text-xs font-semibold">
                  CS
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight text-card-foreground">
                  CodStats
                </span>
                <span className="block text-xs text-muted-foreground">
                  Match Intelligence Platform
                </span>
              </span>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary">
              Snapshot
            </p>

            <div className="mt-2 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-card-foreground sm:text-xl">
                Ranked Intelligence Engine
              </h2>

              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
                Live
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Real time match indexing tied to your account. The panel below
              updates as matches are logged.
            </p>

            <div className="mt-4">
              <LandingLiveStats />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                SR movement
              </span>
              <span className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                Mode splits
              </span>
              <span className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                Session trends
              </span>
            </div>
          </aside>
        </section>

        <section className="mt-20 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-safe:delay-150">
          <h2
            id="features"
            className="scroll-mt-24 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            What Makes CodStats Useful Day to Day
          </h2>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Focused features that help you review faster and improve with less
            guesswork.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <article
                key={feature.title}
                className="min-w-0 rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm"
              >
                <h3 className="text-base font-semibold tracking-tight text-card-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 wrap-break-word text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 pb-10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-safe:delay-200">
          <h2
            id="how-it-works"
            className="scroll-mt-24 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Get Started in 3 Clear Steps
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {workflow.map((item, index) => (
              <article
                key={item.step}
                className="min-w-0 rounded-2xl border border-border/70 bg-background/85 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-foreground">
                  {item.step}
                </h3>
                <p className="mt-2 wrap-break-word text-sm leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-xs text-muted-foreground">
            CodStats - &copy;{" "}
            <Link
              href="https://cleoai.cloud"
              className="hover:underline underline-offset-4 hover:text-foreground"
            >
              CleoAI
            </Link>{" "}
            {new Date().getFullYear()}
          </p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-4">
            <Link
              href="/policies/tos"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Terms
            </Link>
            <Link
              href="/policies/privacy"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
