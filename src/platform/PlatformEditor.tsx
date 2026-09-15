import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleAlert,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";

import {
  AssessmentSection,
  FinalSection,
  IdentitySection,
  OutcomesSection,
  ScheduleSection,
} from "@/components/rps/editor-sections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AiTask } from "@/lib/ai-types";
import { validateRps } from "@/lib/validation";
import {
  DEFAULT_AI_MODEL,
  STEPS,
  useRpsStore,
  type StepId,
} from "@/stores/rps-store";
import {
  api,
  type AccessContext,
  type AiDraftResponse,
  type RpsDocument,
} from "./api";

const stepLabels: Record<StepId, string> = {
  identity: "Identitas",
  outcomes: "CPL & CPMK",
  schedule: "Jadwal",
  assessment: "Assessment",
  final: "Finalisasi",
};

function roleAllowed(access: AccessContext, roles: string[]) {
  return access.roles.some((role) => roles.includes(role.code));
}

export function PlatformEditor({
  rpsId,
  access,
  ai,
  onBack,
  onChanged,
}: {
  rpsId: string;
  access: AccessContext;
  ai: { configured: boolean; model: string };
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data, activeStep, setActiveStep, hydrate } = useRpsStore();
  const [document, setDocument] = useState<RpsDocument | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [proposal, setProposal] = useState<AiDraftResponse | null>(null);
  const [aiBusy, setAiBusy] = useState("");
  const [aiError, setAiError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const savedVersion = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const canEdit = roleAllowed(access, [
    "SUPERADMIN",
    "ADMIN_PRODI",
    "DOSEN_PENGAMPU",
  ]);
  const canVerify = roleAllowed(access, ["SUPERADMIN", "KAPRODI", "GPM"]);
  const issues = useMemo(() => validateRps(data), [data]);

  useEffect(() => {
    let alive = true;
    api
      .get<RpsDocument>(`/api/rps/${rpsId}`)
      .then((loaded) => {
        if (!alive) return;
        setDocument(loaded);
        savedVersion.current = loaded.data.updatedAt;
        hydrate(loaded.data, {
          activeStep: "identity",
          selectedModel: ai.model || DEFAULT_AI_MODEL,
          temperature: 0.2,
          apiKeyStorageMode: "memory",
        });
      })
      .catch((error) => {
        if (alive)
          setLoadError(
            error instanceof Error ? error.message : "RPS gagal dimuat.",
          );
      });
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [ai.model, hydrate, rpsId]);

  useEffect(() => {
    if (
      !document ||
      !canEdit ||
      !["draft", "needs_revision"].includes(document.status) ||
      data.updatedAt === savedVersion.current
    )
      return;
    setSaveState("saving");
    const version = data.updatedAt;
    const timer = window.setTimeout(() => {
      api
        .send<RpsDocument>(`/api/rps/${rpsId}`, "PUT", data)
        .then((updated) => {
          savedVersion.current = version;
          setDocument(updated);
          setSaveState("saved");
          onChanged();
        })
        .catch(() => setSaveState("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [canEdit, data, document, onChanged, rpsId]);

  const runDraft = async (task: AiTask) => {
    setAiBusy("Menyusun proposal…");
    setAiError("");
    setProposal(null);
    try {
      setProposal(await api.draft(rpsId, task));
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Proposal AI gagal dibuat.",
      );
    } finally {
      setAiBusy("");
    }
  };

  const decideProposal = async (decision: "approve" | "reject") => {
    if (!proposal) return;
    setAiBusy(
      decision === "approve" ? "Menerapkan proposal…" : "Menolak proposal…",
    );
    setAiError("");
    try {
      if (decision === "approve") {
        const updated = await api.send<RpsDocument>(
          `/api/ai/suggestions/${proposal.suggestionId}/approve`,
          "POST",
        );
        setDocument(updated);
        savedVersion.current = updated.data.updatedAt;
        hydrate(updated.data, {
          activeStep,
          selectedModel: ai.model,
          temperature: 0.2,
          apiKeyStorageMode: "memory",
        });
      } else
        await api.send(
          `/api/ai/suggestions/${proposal.suggestionId}/reject`,
          "POST",
        );
      setProposal(null);
      onChanged();
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Keputusan proposal gagal disimpan.",
      );
    } finally {
      setAiBusy("");
    }
  };

  const sendChat = async () => {
    const question = prompt.trim();
    if (!question) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPrompt("");
    setAnswer("");
    setAiError("");
    setAiBusy("Menjawab…");
    try {
      await api.streamChat({
        rpsId,
        prompt: question,
        signal: controller.signal,
        onChunk: (chunk) => setAnswer((current) => current + chunk),
      });
    } catch (error) {
      if (!controller.signal.aborted)
        setAiError(error instanceof Error ? error.message : "Chat AI gagal.");
    } finally {
      setAiBusy("");
      abortRef.current = null;
    }
  };

  const lifecycle = async (action: "submit" | "verify") => {
    setLifecycleBusy(true);
    setLoadError("");
    try {
      const updated = await api.send<RpsDocument>(
        `/api/rps/${rpsId}/${action}`,
        "POST",
      );
      setDocument(updated);
      onChanged();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Status RPS gagal diperbarui.",
      );
    } finally {
      setLifecycleBusy(false);
    }
  };

  if (loadError && !document)
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>RPS tidak dapat dibuka</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button className="mt-4" variant="outline" onClick={onBack}>
          <ArrowLeft />
          Kembali
        </Button>
      </div>
    );
  if (!document)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );

  const sectionProps = { onAi: runDraft };
  return (
    <div className="min-h-svh bg-[#f6f8fa]">
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b bg-white px-4 py-2 lg:px-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          RPS
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{document.title}</div>
          <div className="text-xs text-muted-foreground">
            Versi {document.version} · {document.status.replace("_", " ")}
          </div>
        </div>
        <Badge variant={document.status === "verified" ? "default" : "outline"}>
          {document.status}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {saveState === "saving" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saveState === "error"
            ? "Gagal menyimpan"
            : saveState === "saving"
              ? "Menyimpan…"
              : "Tersimpan"}
        </span>
        {canEdit && ["draft", "needs_revision"].includes(document.status) && (
          <Button
            disabled={
              lifecycleBusy || issues.some((issue) => issue.level === "error")
            }
            onClick={() => void lifecycle("submit")}
          >
            <Send />
            Ajukan verifikasi
          </Button>
        )}
        {canVerify && document.status === "submitted" && (
          <Button
            disabled={lifecycleBusy}
            onClick={() => void lifecycle("verify")}
          >
            <ShieldCheck />
            Verifikasi
          </Button>
        )}
      </header>
      {loadError && (
        <div className="px-4 pt-4 lg:px-6">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Tindakan gagal</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </div>
      )}
      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)_330px]">
        <nav className="border-r bg-white p-3 lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)]">
          <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                className={`flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-left text-sm lg:w-full ${activeStep === step ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setActiveStep(step)}
              >
                <span className="text-xs opacity-70">{index + 1}</span>
                {stepLabels[step]}
              </button>
            ))}
          </div>
          <div className="mt-5 hidden border-t pt-4 text-xs text-muted-foreground lg:block">
            <b className="text-foreground">Quality check</b>
            <p className="mt-1">
              {issues.filter((issue) => issue.level === "pass").length}/
              {issues.length} pemeriksaan lulus.
            </p>
          </div>
        </nav>
        <main className="min-w-0 p-4 lg:p-6">
          {activeStep === "identity" ? (
            <IdentitySection {...sectionProps} />
          ) : activeStep === "outcomes" ? (
            <OutcomesSection {...sectionProps} />
          ) : activeStep === "schedule" ? (
            <ScheduleSection {...sectionProps} />
          ) : activeStep === "assessment" ? (
            <AssessmentSection {...sectionProps} />
          ) : (
            <FinalSection {...sectionProps} />
          )}
        </main>
        <aside className="border-l bg-white p-4 lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)] lg:overflow-y-auto">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">AI server</h2>
            <Badge
              className="ml-auto"
              variant={ai.configured ? "secondary" : "outline"}
            >
              {ai.configured ? ai.model : "Belum aktif"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            API key tersimpan di server. Draft tidak pernah langsung menulis
            form.
          </p>
          {aiBusy && (
            <div className="mt-4 flex items-center gap-2 text-xs">
              <Loader2 className="size-4 animate-spin text-primary" />
              {aiBusy}
            </div>
          )}
          {aiError && (
            <Alert className="mt-4" variant="destructive">
              <CircleAlert />
              <AlertTitle>AI gagal</AlertTitle>
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}
          {proposal && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">
                  {proposal.draft.label}
                </CardTitle>
                <CardDescription>
                  Proposal terstruktur · tinjau sebelum diterapkan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                  {JSON.stringify(proposal.draft.payload, null, 2)}
                </pre>
                {proposal.draft.warnings.length > 0 && (
                  <p className="mt-3 text-xs text-amber-700">
                    {proposal.draft.warnings.join(" · ")}
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  {proposal.draft.task !== "review" && (
                    <Button
                      size="sm"
                      disabled={Boolean(aiBusy)}
                      onClick={() => void decideProposal("approve")}
                    >
                      <Check />
                      Terapkan
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(aiBusy)}
                    onClick={() => void decideProposal("reject")}
                  >
                    <X />
                    Tolak
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {answer && (
            <div className="mt-4 border-l-2 border-primary bg-muted/40 p-3 text-sm whitespace-pre-wrap">
              {answer}
            </div>
          )}
          <div className="mt-5 space-y-2">
            <Input
              value={prompt}
              disabled={!ai.configured || Boolean(aiBusy)}
              placeholder="Tanyakan tentang RPS ini…"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendChat();
              }}
            />
            <div className="flex justify-end">
              {aiBusy === "Menjawab…" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => abortRef.current?.abort()}
                >
                  <Square />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!ai.configured || !prompt.trim()}
                  onClick={() => void sendChat()}
                >
                  <Send />
                  Kirim
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
