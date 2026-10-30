// The admin island: the sign-in gate, the section tabs and the sections.
import { FileText, Inbox, KeyRound, LayoutDashboard, LogOut, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { TooltipProvider } from "@/components/shadcn/tooltip";
import { api, message, setUnauthorizedHandler } from "./api.ts";
import { Content } from "./Content.tsx";
import { Drafts } from "./Drafts.tsx";
import { Overview } from "./Overview.tsx";
import { go, useRoute, type Section } from "./route.ts";
import { SignIn } from "./SignIn.tsx";
import { Tokens } from "./Tokens.tsx";
import { IconButton, Loading, Notice, Pill, TabBar, Toaster, useToast } from "./ui.tsx";

type Gate = { at: "loading" } | { at: "error"; text: string } | { at: "signin"; hasPasskey: boolean } | { at: "ready" };

export function AdminApp() {
  return (
    <TooltipProvider delayDuration={300}>
      <Toaster>
        <div className="app-root mx-auto w-full max-w-[var(--content-max)] px-4 pt-4 pb-10 text-sm text-foreground md:px-8 md:pt-8">
          <Gatekeeper />
        </div>
      </Toaster>
    </TooltipProvider>
  );
}

function Gatekeeper() {
  const [gate, setGate] = useState<Gate>({ at: "loading" });

  const check = useCallback(async () => {
    setGate({ at: "loading" });
    try {
      const s = await api.state();
      setGate(s.signedIn ? { at: "ready" } : { at: "signin", hasPasskey: s.hasPasskey });
    } catch (e) {
      setGate({ at: "error", text: message(e) });
    }
  }, []);

  useEffect(() => {
    void check();
    setUnauthorizedHandler(() => setGate({ at: "signin", hasPasskey: true }));
  }, [check]);

  if (gate.at === "loading") return <Loading className="py-24" />;
  if (gate.at === "error")
    return (
      <div className="mx-auto max-w-sm py-16">
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={check}>
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          }
        >
          {gate.text}
        </Notice>
      </div>
    );
  if (gate.at === "signin") return <SignIn hasPasskey={gate.hasPasskey} onSignedIn={() => setGate({ at: "ready" })} onRecheck={check} />;
  return <Dashboard onSignedOut={() => setGate({ at: "signin", hasPasskey: true })} />;
}

function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const route = useRoute();
  const toast = useToast();
  const [pending, setPending] = useState<number | null>(null);
  const [gap, setGap] = useState<string>("");
  const [leaving, setLeaving] = useState(false);

  const refreshPending = useCallback(() => {
    api
      .drafts("pending")
      .then((d) => setPending(d.length))
      .catch(() => {});
  }, []);
  useEffect(refreshPending, [refreshPending]);

  async function signOut() {
    setLeaving(true);
    try {
      await api.logout();
      onSignedOut();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setLeaving(false);
    }
  }

  const tabs = [
    { value: "overview" as Section, label: "Overview", icon: <LayoutDashboard className="size-4 max-md:hidden" /> },
    { value: "content" as Section, label: "Content", icon: <FileText className="size-4 max-md:hidden" /> },
    {
      value: "drafts" as Section,
      label: "Drafts",
      icon: <Inbox className="size-4 max-md:hidden" />,
      badge: pending ? (
        <Pill tone="brand" className="ml-0.5 min-w-5 justify-center">
          <span className="sr-only">, pending: </span>
          {pending}
        </Pill>
      ) : null,
    },
    { value: "tokens" as Section, label: "Tokens", icon: <KeyRound className="size-4 max-md:hidden" /> },
  ];

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <TabBar
        label="Admin sections"
        value={route.section}
        options={tabs}
        onChange={(s) => go(s)}
        end={
          <IconButton label="Sign out" side="left" onClick={signOut} busy={leaving}>
            <LogOut />
          </IconButton>
        }
      />
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${route.section}`} className="min-w-0">
        {route.section === "overview" && (
          <Overview
            onGap={(question, kind) => {
              setGap(question);
              go("content", kind, ...(kind === "profile" ? [] : ["new"]));
            }}
          />
        )}
        {route.section === "content" && <Content parts={route.parts} gap={gap} onClearGap={() => setGap("")} />}
        {route.section === "drafts" && <Drafts parts={route.parts} onPendingChange={setPending} />}
        {route.section === "tokens" && <Tokens />}
      </div>
    </div>
  );
}
