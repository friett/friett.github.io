// Tokens for agents that propose drafts. A new token is shown once.
import { Bot, Check, Copy, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { api, message, type Token } from "./api.ts";
import { ActionButton, Blank, Card, CardHead, Confirm, IconButton, Loading, Notice, SectionHeader, When, useCopy, useToast } from "./ui.tsx";

export function Tokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [secret, setSecret] = useState<{ name: string; token: string } | null>(null);
  const [revoking, setRevoking] = useState<Token | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setTokens(await api.tokens());
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await api.createToken(name.trim() || "Agent");
      setTokens((list) => [...(list ?? []), { id: res.id, name: res.name, createdAt: new Date().toISOString() }]);
      setSecret({ name: res.name, token: res.token });
      setName("");
    } catch (err) {
      setCreateError(message(err));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: Token) {
    try {
      await api.deleteToken(token.id);
      setTokens((list) => list?.filter((t) => t.id !== token.id) ?? list);
      toast(`Revoked “${token.name}”`);
    } catch (e) {
      toast(message(e), "error");
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Agent tokens" />
      {error && (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      )}
      {!tokens ? (
        !error && <Loading />
      ) : (
        <Card>
          <ul className="m-0 list-none p-0">
            {tokens.length === 0 && (
              <li className="border-b border-border">
                <Blank icon={<Bot />} title="No agent tokens. Name one below to let an agent propose drafts." className="py-6" />
              </li>
            )}
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-border py-2 pr-2 pl-4">
                <KeyRound className="size-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <When iso={t.createdAt} className="text-xs" />
                <IconButton label="Revoke" onClick={() => setRevoking(t)} className="hover:text-destructive">
                  <Trash2 />
                </IconButton>
              </li>
            ))}
            <li>
              <form onSubmit={create} className="flex items-center gap-2 px-2 py-2 md:px-3">
                <Plus className="ml-2 size-4 shrink-0 text-subtle" aria-hidden />
                <label htmlFor="token-name" className="sr-only">
                  Token name
                </label>
                <Input
                  id="token-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="New token, e.g. Claude LinkedIn"
                  autoComplete="off"
                  className="h-8 flex-1 border-transparent bg-transparent text-sm shadow-none hover:border-border focus-visible:border-ring dark:bg-transparent"
                />
                <ActionButton type="submit" size="sm" busy={creating}>
                  Create
                </ActionButton>
              </form>
              {createError && (
                <div className="px-4 pb-3">
                  <Notice onClose={() => setCreateError("")}>{createError}</Notice>
                </div>
              )}
            </li>
          </ul>
        </Card>
      )}

      <Card>
        <CardHead title="How an agent uses it" icon={<Bot />} />
        <div className="flex flex-col gap-2 px-4 py-3">
          <Snippet text={`POST ${location.origin}/api/admin/drafts\nAuthorization: Bearer <token>\n\n{"kind": "role", "action": "update", "data": {…}, "reason": "…"}`} />
          <span className="text-xs text-muted-foreground">Agents only propose drafts. Nothing changes until you apply it.</span>
        </div>
      </Card>

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <Confirm
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this token?"
        body={revoking && <>Agents using “{revoking.name}” can no longer post drafts. This cannot be undone.</>}
        confirm="Revoke"
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
      />
    </div>
  );
}

function Snippet({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="relative">
      <pre className="m-0 overflow-x-auto rounded-lg border border-border bg-sunken py-2.5 pr-11 pl-3 font-mono text-xs leading-relaxed whitespace-pre">{text}</pre>
      <IconButton label={copied ? "Copied" : "Copy"} onClick={() => copy(text)} className="absolute top-1.5 right-1.5">
        {copied ? <Check /> : <Copy />}
      </IconButton>
    </div>
  );
}

function SecretDialog({ secret, onClose }: { secret: { name: string; token: string } | null; onClose: () => void }) {
  const [copied, copy] = useCopy();
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="app-root grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Token for “{secret?.name}”</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-sunken px-2.5 py-1.5 font-mono text-xs select-all">{secret?.token}</code>
            <Button variant="outline" size="sm" onClick={() => secret && copy(secret.token)} autoFocus>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">Shown once. Store it in the agent's secrets now.</span>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
