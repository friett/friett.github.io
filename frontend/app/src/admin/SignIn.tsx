// Passkey-only sign-in, and the one-time setup of the passkey from the private link.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Link2Off, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/shadcn/button";
import { api, ApiError, message } from "./api.ts";
import { clearHash, setupToken } from "./route.ts";
import { ActionButton, Card, Notice } from "./ui.tsx";

function friendly(error: unknown, setup: boolean): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError")
    return setup ? "The passkey was not created: the prompt was closed or timed out." : "Sign-in was cancelled or timed out.";
  if (name === "InvalidStateError") return "This device already holds a passkey for this site. Use Sign in instead.";
  if (name === "SecurityError") return "Passkeys need the site's own address (HTTPS or localhost).";
  if (error instanceof ApiError) return error.message;
  return message(error) || "Something went wrong.";
}

export function SignIn({ hasPasskey, onSignedIn, onRecheck }: { hasPasskey: boolean; onSignedIn: () => void; onRecheck: () => void }) {
  const token = setupToken();
  const setup = !hasPasskey && !!token;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = browserSupportsWebAuthn();

  async function run() {
    setBusy(true);
    setError("");
    try {
      if (setup) {
        const optionsJSON = (await api.registerOptions(token)) as Parameters<typeof startRegistration>[0]["optionsJSON"];
        const credential = await startRegistration({ optionsJSON });
        await api.registerVerify(credential);
        clearHash();
      } else {
        const optionsJSON = (await api.loginOptions()) as Parameters<typeof startAuthentication>[0]["optionsJSON"];
        const credential = await startAuthentication({ optionsJSON });
        await api.loginVerify(credential);
        if (token) clearHash();
      }
      onSignedIn();
    } catch (e) {
      setError(friendly(e, setup));
    } finally {
      setBusy(false);
    }
  }

  const needsLink = !hasPasskey && !token;

  return (
    <div className="flex justify-center py-10 md:py-16">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
            {needsLink ? <Link2Off className="size-5" /> : setup ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
          </span>
          <h1 className="m-0 text-[length:var(--fs-title)] leading-tight font-semibold">
            {needsLink ? "Setup link needed" : setup ? "Set up your passkey" : "Sign in"}
          </h1>
          {needsLink ? (
            <p className="m-0 text-sm text-muted-foreground">No passkey yet. Open the private setup link to create one.</p>
          ) : setup ? (
            <p className="m-0 text-sm text-muted-foreground">This creates the only passkey for this admin.</p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {!supported ? (
            <Notice action={<Button variant="outline" size="sm" onClick={() => location.reload()}>Reload</Button>}>
              This browser does not support passkeys. Open the admin in a current browser.
            </Notice>
          ) : needsLink ? (
            <Button variant="outline" onClick={onRecheck}>
              <RefreshCw data-icon="inline-start" />
              Check again
            </Button>
          ) : (
            <ActionButton size="lg" busy={busy} onClick={run} autoFocus icon={<KeyRound data-icon="inline-start" />}>
              {setup ? "Create passkey" : "Sign in with passkey"}
            </ActionButton>
          )}
          {error && (
            <Notice
              action={
                <Button variant="ghost" size="sm" onClick={run} disabled={busy}>
                  Try again
                </Button>
              }
            >
              {error}
            </Notice>
          )}
        </div>
      </Card>
    </div>
  );
}
