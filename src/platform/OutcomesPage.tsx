import { useCallback, useEffect, useState } from "react";
import {
  Calculator,
  CircleAlert,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";

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
import { api, type PlatformData } from "./api";
import { ImportPanel } from "./ImportPanel";

type OutcomeData = {
  class: { id: string; courseName: string; className: string };
  rps: { id: string; title: string; version: number } | null;
  enrollments: Array<{
    id: string;
    studentId: string;
    nim: string;
    name: string;
  }>;
  assessments: Array<{
    id: string;
    code: string;
    name: string;
    weight: string;
  }>;
  scores: Array<{
    id: string;
    enrollmentId: string;
    assessmentId: string;
    rawScore: string;
    status: string;
  }>;
  run: { id: string; status: string; completedAt: string | null } | null;
  achievements: Array<{
    id: string;
    scope: string;
    outcomeCode: string;
    value: string | null;
    target: string;
    status: string;
  }>;
  cqi: Array<{
    id: string;
    title: string;
    analysis: string;
    actionPlan: string;
    status: string;
    outcomeCode: string;
  }>;
};

export function OutcomesPage({ platform, initialClassId }: { platform: PlatformData; initialClassId?: string }) {
  const [classId, setClassId] = useState(platform.classes.some(item => item.id === initialClassId) ? initialClassId! : platform.classes[0]?.id ?? "");
  const canGrade = platform.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"].includes(role.code));
  const canCalculate = platform.access.roles.some(role => ["SUPERADMIN", "KAPRODI", "GPM", "DOSEN_PENGAMPU"].includes(role.code));
  const studentOnly = !platform.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"].includes(role.code));
  const [data, setData] = useState<OutcomeData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!classId) return;
    try {
      setData(await api.get<OutcomeData>(`/api/classes/${classId}/outcomes`));
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Data capaian gagal dimuat.",
      );
    }
  }, [classId]);
  // The effect synchronizes the selected class with its server snapshot.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  const action = async (name: string, path: string) => {
    setBusy(name);
    setError("");
    try {
      await api.send(path, "POST");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tindakan gagal.");
    } finally {
      setBusy("");
    }
  };
  const saveScore = async (
    enrollmentId: string,
    assessmentId: string,
    raw: string,
  ) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError("Nilai harus berada pada rentang 0–100.");
      return;
    }
    setBusy(`${enrollmentId}:${assessmentId}`);
    try {
      await api.send("/api/scores", "PUT", {
        enrollmentId,
        assessmentId,
        rawScore: value,
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Nilai gagal disimpan.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nilai & capaian OBE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nilai dirilis dosen, lalu capaian CPMK dihitung dari assessment
            berbobot.
          </p>
        </div>
        <div className="min-w-64">
          <label className="mb-1 block text-xs font-medium">Kelas</label>
          <select
            className="h-9 w-full rounded-md border bg-white px-3 text-sm"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setData(null);
            }}
          >
            {platform.classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.courseCode} · {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <Alert className="mt-4" variant="destructive">
          <CircleAlert />
          <AlertTitle>Tindakan gagal</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!classId && (
        <Card className="mt-6">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Tidak ada kelas pada scope Anda.
          </CardContent>
        </Card>
      )}
      {classId && !data && !error && (
        <div className="grid min-h-64 place-items-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}
      {data && (
        <div className="mt-6 space-y-5">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {data.class.courseName} · {data.class.className}
                  </CardTitle>
                  <CardDescription>
                    {data.rps
                      ? `RPS Verified v${data.rps.version}`
                      : "Belum ada RPS Verified. Selesaikan workflow RPS sebelum input nilai."}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void load()}
                  >
                    <RefreshCw />
                    Muat ulang
                  </Button>
                  {data.rps && canGrade && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void action(
                          "sync",
                          `/api/classes/${classId}/assessments/sync`,
                        )
                      }
                    >
                      {busy === "sync" && <Loader2 className="animate-spin" />}
                      Sinkronkan assessment
                    </Button>
                  )}
                  {canCalculate && <Button
                    size="sm"
                    disabled={Boolean(busy) || !data.assessments.length}
                    onClick={() =>
                      void action(
                        "calculate",
                        `/api/classes/${classId}/calculate`,
                      )
                    }
                  >
                    {busy === "calculate" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Calculator />
                    )}
                    Hitung capaian
                  </Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.assessments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2">Mahasiswa</th>
                        {data.assessments.map((item) => (
                          <th className="px-2" key={item.id}>
                            {item.code}
                            <small className="block font-normal">
                              {Number(item.weight)}%
                            </small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.enrollments.map((enrollment) => (
                        <tr className="border-b" key={enrollment.id}>
                          <td className="py-3">
                            <b>{enrollment.name}</b>
                            <small className="block text-muted-foreground">
                              {enrollment.nim}
                            </small>
                          </td>
                          {data.assessments.map((assessment) => {
                            const score = data.scores.find(
                              (item) =>
                                item.enrollmentId === enrollment.id &&
                                item.assessmentId === assessment.id,
                            );
                            const key = `${enrollment.id}:${assessment.id}`;
                            return (
                              <td className="px-2" key={assessment.id}>
                                <div className="flex items-center gap-1">
                                  <Input
                                    className="w-20"
                                    type="number"
                                    min="0"
                                    max="100"
                                    defaultValue={score?.rawScore ?? ""}
                                    disabled={
                                      !canGrade ||
                                      score?.status === "released" ||
                                      busy === key
                                    }
                                    onBlur={(event) => {
                                      if (
                                        event.target.value !== "" &&
                                        event.target.value !== score?.rawScore
                                      )
                                        void saveScore(
                                          enrollment.id,
                                          assessment.id,
                                          event.target.value,
                                        );
                                    }}
                                  />
                                  {canGrade && score?.status === "draft" && (
                                    <Button
                                      size="icon-xs"
                                      variant="ghost"
                                      aria-label="Rilis nilai"
                                      onClick={() =>
                                        void action(
                                          score.id,
                                          `/api/scores/${score.id}/release`,
                                        )
                                      }
                                    >
                                      {busy === score.id ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        <Send />
                                      )}
                                    </Button>
                                  )}
                                  {score?.status === "released" && (
                                    <Badge variant="outline">rilis</Badge>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Assessment belum disinkronkan dari RPS Verified.
                </p>
              )}
            </CardContent>
          </Card>
          {canGrade && data.rps && <ImportPanel key={classId} classId={classId} kind="scores" onSaved={load} />}
          <p className="text-xs text-muted-foreground">Nilai dirilis: {data.scores.filter(item => item.status === "released").length} dari {data.enrollments.length * data.assessments.length} sel. Target mahasiswa: 60. Target capaian kelas: 70% mahasiswa dengan nilai lengkap mencapai target.</p>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{studentOnly ? "Capaian saya" : "Capaian kelas terbaru"}</CardTitle>
                <CardDescription>
                  {data.run
                    ? `Run ${data.run.status}`
                    : "Belum pernah dihitung"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.achievements
                  .filter((item) => item.scope === (studentOnly ? "student" : "class"))
                  .map((item) => (
                    <div
                      className="flex items-center justify-between border-b py-2 last:border-0"
                      key={item.id}
                    >
                      <span className="font-medium">{item.outcomeCode}</span>
                      <span className="text-sm">
                        {item.value === null
                          ? "Tidak ada data"
                          : `${Number(item.value).toFixed(1)}%`}{" "}
                        <small>Target {Number(item.target)}%</small>
                        <Badge
                          className="ml-2"
                          variant={
                            item.status === "achieved"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {item.status}
                        </Badge>
                      </span>
                    </div>
                  ))}
                {!data.achievements.some((item) => item.scope === (studentOnly ? "student" : "class")) && (
                  <p className="text-sm text-muted-foreground">
                    Belum ada hasil.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Continuous Quality Improvement</CardTitle>
                <CardDescription>
                  Finding otomatis ketika capaian kelas di bawah target.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.cqi.map((item) => (
                  <div
                    className="border-l-2 border-amber-500 pl-3"
                    key={item.id}
                  >
                    <div className="flex items-center justify-between">
                      <b className="text-sm">{item.title}</b>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.analysis}
                    </p>
                  </div>
                ))}
                {data.cqi.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Tidak ada finding CQI pada run terbaru.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
