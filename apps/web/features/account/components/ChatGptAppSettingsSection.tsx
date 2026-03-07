"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"

import { api } from "@workspace/backend/convex/_generated/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type DisconnectState = "idle" | "pending" | "error"

type ChatGptAppSettingsSectionProps = {
  connectHref?: string
}

const CHATGPT_HOME_URL = "https://chatgpt.com/"

function formatLinkedAt(value: number | undefined) {
  if (!value) {
    return "Pending"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function ChatGptAppSettingsSection({
  connectHref,
}: ChatGptAppSettingsSectionProps) {
  const router = useRouter()
  const user = useQuery(api.queries.users.current)
  const dedicatedConnectHref =
    connectHref?.trim() ||
    process.env.NEXT_PUBLIC_CHATGPT_APP_CONNECT_URL?.trim()
  const resolvedConnectHref = dedicatedConnectHref || CHATGPT_HOME_URL

  const [disconnectState, setDisconnectState] =
    useState<DisconnectState>("idle")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [connectStarted, setConnectStarted] = useState(false)

  const linked = user?.chatgptLinked === true

  useEffect(() => {
    if (!connectStarted || linked) {
      return
    }

    const refreshConnectionState = () => {
      setStatusMessage("Checking connection state…")
      router.refresh()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshConnectionState()
      }
    }

    window.addEventListener("focus", refreshConnectionState)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("focus", refreshConnectionState)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [connectStarted, linked, router])

  useEffect(() => {
    if (connectStarted && linked) {
      setConnectStarted(false)
      setStatusMessage("Connected. Account state updated.")
    }
  }, [connectStarted, linked])

  const handleDisconnect = async () => {
    setDisconnectState("pending")
    setStatusMessage(null)

    try {
      const response = await fetch("/oauth/revoke?source=settings", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-codstats-csrf": "1",
        },
        body: "{}",
      })

      if (!response.ok) {
        let message = "Unable to disconnect right now."

        try {
          const payload = (await response.json()) as {
            error_description?: string
          }
          if (payload.error_description) {
            message = payload.error_description
          }
        } catch {
          message = "Unable to disconnect right now."
        }

        throw new Error(message)
      }

      setDisconnectState("idle")
      setStatusMessage("Disconnected. Refreshing account state…")
      router.refresh()
    } catch (error) {
      setDisconnectState("error")
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to disconnect right now."
      )
    }
  }

  return (
    <section aria-labelledby="chatgpt-app-settings-heading" className="min-w-0">
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="border-b border-border/70">
          <CardTitle id="chatgpt-app-settings-heading" className="text-base">
            ChatGPT App
          </CardTitle>
          <CardDescription>
            Manage OAuth linking for your ChatGPT app integration.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {user === undefined ? (
            <p className="text-sm text-muted-foreground">
              Loading connection state…
            </p>
          ) : user === null ? (
            <p className="text-sm text-muted-foreground">
              Sign in to manage your ChatGPT app connection.
            </p>
          ) : linked ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Connected</Badge>
              </div>

              <p className="text-sm text-foreground">
                Linked At: {formatLinkedAt(user.chatgptLinkedAt)}
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Not Connected</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect in ChatGPT. OAuth starts when you run a CodStats action.
              </p>
              {!dedicatedConnectHref ? (
                <p className="text-sm text-muted-foreground">
                  Open ChatGPT, start CodStats, and run a stats tool to trigger
                  authorization.
                </p>
              ) : null}
              {connectStarted ? (
                <p className="text-sm text-muted-foreground">
                  Complete OAuth in the opened tab. This state updates
                  automatically.
                </p>
              ) : null}
            </>
          )}

          {statusMessage ? (
            <p aria-live="polite" className="text-sm text-foreground">
              {statusMessage}
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="border-t border-border/70 pt-4">
          {linked ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={disconnectState === "pending"}
                >
                  {disconnectState === "pending"
                    ? "Disconnecting…"
                    : "Disconnect"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect ChatGPT App?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This revokes the current ChatGPT OAuth connection for your
                    account.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button asChild>
              <a
                href={resolvedConnectHref}
                onClick={() => {
                  setConnectStarted(true)
                  setStatusMessage(
                    "Opening ChatGPT. Run a CodStats action to complete authorization."
                  )
                }}
                rel="noopener noreferrer"
                target="_blank"
              >
                Connect
              </a>
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  )
}
