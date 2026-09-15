import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CircleAlert,
  Database,
  FilePlus2,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  School,
  Users,
} from "lucide-react";

import undipLogo from "@/assets/logo-undip.png?inline";
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
import { Label } from "@/components/ui/label";
import { createEmptyRps } from "@/schemas/rps-schema";
import {
  api,
  type AccessContext,
  type PlatformData,
  type RpsDocument,
} from "./api";
import { PlatformEditor } from "./PlatformEditor";
import { OutcomesPage } from "./OutcomesPage";

type View = "dashboard" | "master" | "rps" | "outcomes";
const selectClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30";

export function Login({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.send("/api/auth/sign-in/email", "POST", {
        email,
        password,
        rememberMe: true,
      });
      await onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-svh bg-[#f3f6f8] lg:grid-cols-[1.15fr_.85fr]">
      <section className="hidden border-r bg-[#083d68] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img
            className="size-12 object-contain"
            src={undipLogo}
            alt="Universitas Diponegoro"
          />
          <div>
            <div className="font-semibold">RPS OBE Studio</div>
            <div className="text-sm text-blue-100">
              FSM Informatika · Universitas Diponegoro
            </div>
          </div>
        </div>
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold leading-tight">
            Kelola RPS, kelas, kurikulum, dan verifikasi OBE dalam satu alur.
          </h1>
          <p className="mt-5 max-w-lg leading-relaxed text-blue-100">
            Susun pembelajaran, tinjau RPS, dan tindak lanjuti capaian mahasiswa.
          </p>
        </div>
        <div />
      </section>
      <section className="grid place-items-center p-6">
        <form className="w-full max-w-sm" onSubmit={submit}>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              className="size-11 object-contain"
              src={undipLogo}
              alt="UNDIP"
            />
            <b>RPS OBE Studio</b>
          </div>
          <h2 className="text-2xl font-semibold">Masuk ke workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Masukkan email dan password akun Anda.
          </p>
          {error && (
            <Alert className="mt-5" variant="destructive">
              <CircleAlert />
              <AlertTitle>Login gagal</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" className="text-xs text-primary" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Sembunyikan password" : "Tampilkan password"}</button>
            </div>
            <Button className="w-full" size="lg" type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Masuk
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border-l-2 border-primary bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function Dashboard({
  data,
  onOpenRps,
}: {
  data: PlatformData;
  onOpenRps: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ringkasan akademik</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<Users className="size-4" />}
          label="RPS draft"
          value={data.rps.filter(item => ["draft", "needs_revision"].includes(item.status)).length}
        />
        <Stat
          icon={<GraduationCap className="size-4" />}
          label="Menunggu review"
          value={data.rps.filter(item => item.status === "submitted").length}
        />
        <Stat
          icon={<BookOpen className="size-4" />}
          label="RPS terverifikasi"
          value={data.rps.filter(item => item.status === "verified").length}
        />
        <Stat
          icon={<School className="size-4" />}
          label="Kelas"
          value={data.classes.length}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>RPS terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2">Dokumen</th>
                    <th>Status</th>
                    <th>Versi</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...data.rps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map((rps) => (
                    <tr className="border-b last:border-0" key={rps.id}>
                      <td className="py-3">
                        <b>{rps.title}</b>
                        <div className="text-xs text-muted-foreground">
                          Diperbarui{" "}
                          {new Date(rps.updatedAt).toLocaleDateString("id-ID")}
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            rps.status === "verified" ? "default" : "outline"
                          }
                        >
                          {rps.status}
                        </Badge>
                      </td>
                      <td>v{rps.version}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenRps(rps.id)}
                        >
                          Buka
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.rps.length === 0 && (
                    <tr>
                      <td
                        className="py-8 text-center text-muted-foreground"
                        colSpan={4}
                      >
                        Belum ada RPS.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Struktur aktif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.programs.map((program) => (
              <div className="border-b pb-3 last:border-0" key={program.id}>
                <div className="font-semibold">
                  {program.code} · {program.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {
                    data.curricula.filter(
                      (item) => item.programId === program.id,
                    ).length
                  }{" "}
                  kurikulum ·{" "}
                  {
                    data.cohorts.filter((item) => item.programId === program.id)
                      .length
                  }{" "}
                  angkatan ·{" "}
                  {
                    data.courses.filter((item) => item.programId === program.id)
                      .length
                  }{" "}
                  mata kuliah
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MasterData({
  data,
  reload,
}: {
  data: PlatformData;
  reload: () => Promise<void>;
}) {
  const [tab, setTab] = useState("program");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    transform: (form: FormData) => object,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      await api.send(
        `/api/admin/${endpoint}`,
        "POST",
        transform(new FormData(event.currentTarget)),
      );
      form.reset();
      await reload();
      setMessage("Data berhasil ditambahkan.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Data gagal ditambahkan.",
      );
    } finally {
      setBusy(false);
    }
  };
  const superadmin = data.access.roles.some(
    (role) => role.code === "SUPERADMIN",
  );
  const tabs = [
    ["program", "Program Studi"],
    ["period", "Periode"],
    ["curriculum", "Kurikulum"],
    ["cohort", "Angkatan"],
    ["course", "Mata Kuliah"],
    ["class", "Kelas"],
  ].filter(([id]) => superadmin || !["program", "period"].includes(id));
  const currentTab = tabs.some(([id]) => id === tab) ? tab : "curriculum";
  return (
    <div>
      <h1 className="text-2xl font-semibold">Master data</h1>
      <div className="mt-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map(([id, label]) => (
          <button
            className={`min-w-max border-b-2 px-3 py-2 text-sm ${currentTab === id ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground"}`}
            key={id}
            onClick={() => {
              setTab(id);
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <Alert className="mt-4">
          <Database />
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{tabs.find(([id]) => id === currentTab)?.[1]}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentTab === "program" && (
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={(event) =>
                void submit(event, "programs", (f) => ({
                  code: f.get("code"),
                  name: f.get("name"),
                  faculty: f.get("faculty"),
                }))
              }
            >
              <Field name="code" label="Kode" />
              <Field name="name" label="Nama program" />
              <Field name="faculty" label="Fakultas" />
              <Submit busy={busy} />
            </form>
          )}
          {currentTab === "period" && (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) =>
                void submit(event, "periods", (f) => ({
                  code: f.get("code"),
                  name: f.get("name"),
                  startsOn: f.get("startsOn"),
                  endsOn: f.get("endsOn"),
                }))
              }
            >
              <Field name="code" label="Kode" />
              <Field name="name" label="Nama periode" />
              <Field name="startsOn" label="Tanggal mulai" type="date" />
              <Field name="endsOn" label="Tanggal selesai" type="date" />
              <Submit busy={busy} />
            </form>
          )}
          {currentTab === "curriculum" && (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) =>
                void submit(event, "curricula", (f) => ({
                  programId: f.get("programId"),
                  code: f.get("code"),
                  name: f.get("name"),
                  version: Number(f.get("version")),
                }))
              }
            >
              <Select
                name="programId"
                label="Program"
                options={data.programs.map((v) => [
                  v.id,
                  `${v.code} · ${v.name}`,
                ])}
              />
              <Field name="code" label="Kode" />
              <Field name="name" label="Nama kurikulum" />
              <Field
                name="version"
                label="Versi"
                type="number"
                defaultValue="1"
              />
              <Submit busy={busy} />
            </form>
          )}
          {currentTab === "cohort" && (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) =>
                void submit(event, "cohorts", (f) => ({
                  programId: f.get("programId"),
                  curriculumId: f.get("curriculumId"),
                  entryYear: Number(f.get("entryYear")),
                  name: f.get("name"),
                }))
              }
            >
              <Select
                name="programId"
                label="Program"
                options={data.programs.map((v) => [v.id, v.name])}
              />
              <Select
                name="curriculumId"
                label="Kurikulum"
                options={data.curricula.map((v) => [v.id, v.name])}
              />
              <Field name="entryYear" label="Tahun masuk" type="number" />
              <Field name="name" label="Nama angkatan" />
              <Submit busy={busy} />
            </form>
          )}
          {currentTab === "course" && (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) =>
                void submit(event, "courses", (f) => ({
                  programId: f.get("programId"),
                  curriculumId: f.get("curriculumId"),
                  code: f.get("code"),
                  name: f.get("name"),
                  nameEn: f.get("nameEn"),
                  credits: Number(f.get("credits")),
                  semester: Number(f.get("semester")),
                }))
              }
            >
              <Select
                name="programId"
                label="Program"
                options={data.programs.map((v) => [v.id, v.name])}
              />
              <Select
                name="curriculumId"
                label="Kurikulum"
                options={data.curricula.map((v) => [v.id, v.name])}
              />
              <Field name="code" label="Kode MK" />
              <Field name="name" label="Nama MK" />
              <Field name="nameEn" label="Nama Inggris" />
              <Field name="credits" label="SKS" type="number" />
              <Field name="semester" label="Semester" type="number" />
              <Submit busy={busy} />
            </form>
          )}
          {currentTab === "class" && (
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) =>
                void submit(event, "classes", (f) => ({
                  curriculumCourseId: f.get("curriculumCourseId"),
                  cohortId: f.get("cohortId"),
                  periodId: f.get("periodId"),
                  code: f.get("code"),
                  name: f.get("name"),
                  capacity: Number(f.get("capacity")),
                }))
              }
            >
              <Select
                name="curriculumCourseId"
                label="Mata kuliah"
                options={data.curriculumCourses.map((v) => [
                  v.id,
                  `${v.courseCode} · ${v.courseName}`,
                ])}
              />
              <Select
                name="cohortId"
                label="Angkatan"
                options={data.cohorts.map((v) => [v.id, v.name])}
              />
              <Select
                name="periodId"
                label="Periode"
                options={data.periods.map((v) => [v.id, v.name])}
              />
              <Field name="code" label="Kode kelas" />
              <Field name="name" label="Nama kelas" />
              <Field
                name="capacity"
                label="Kapasitas"
                type="number"
                defaultValue="40"
              />
              <Submit busy={busy} />
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required
      />
    </div>
  );
}
function Select({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select className={selectClass} id={name} name={name} required>
        <option value="">Pilih…</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function Submit({ busy }: { busy: boolean }) {
  return (
    <div className="flex items-end">
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}Tambah data
      </Button>
    </div>
  );
}

export function RpsList({
  data,
  reload,
  onOpen,
}: {
  data: PlatformData;
  reload: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const createRps = async (classId: string) => {
    const section = data.classes.find((item) => item.id === classId);
    if (!section) return;
    setBusyId(classId);
    setError("");
    try {
      const latest = data.rps.filter(item => item.classId === classId).sort((a, b) => b.version - a.version)[0];
      const base = latest ? (await api.get<RpsDocument>(`/api/rps/${latest.id}`)).data : createEmptyRps();
      const program = data.programs.find(item => item.id === section.programId);
      const document = await api.send<RpsDocument>("/api/rps", "POST", {
        classId,
        data: {
          ...base,
          meta: {
            ...base.meta,
            institution: "Universitas Diponegoro",
            faculty: program?.faculty ?? base.meta.faculty,
            program: program?.name ?? base.meta.program,
            courseName: section.courseName,
            code: section.courseCode,
          },
        },
      });
      await reload();
      onOpen(document.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "RPS gagal dibuat.");
    } finally {
      setBusyId("");
    }
  };
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dokumen RPS</h1>
      {error && (
        <Alert className="mt-4" variant="destructive">
          <CircleAlert />
          <AlertTitle>Gagal</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {data.classes.map((section) => {
          const docs = data.rps.filter((rps) => rps.classId === section.id);
          return (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {section.courseCode} · {section.courseName}
                    </CardTitle>
                    <CardDescription>
                      {section.name} · {section.cohortName} ·{" "}
                      {section.periodName}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{section.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {docs.map((rps) => (
                    <button
                      className="flex w-full items-center justify-between border-b px-1 py-3 text-left last:border-0 hover:text-primary"
                      type="button"
                      key={rps.id}
                      onClick={() => onOpen(rps.id)}
                    >
                      <span>
                        <b className="text-sm">{rps.title}</b>
                        <small className="mt-1 block text-muted-foreground">
                          Versi {rps.version} · {rps.status}
                        </small>
                      </span>
                      <Badge
                        variant={
                          rps.status === "verified" ? "default" : "secondary"
                        }
                      >
                        {rps.status}
                      </Badge>
                    </button>
                  ))}
                </div>
                {data.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"].includes(role.code)) && <Button
                  className="mt-4"
                  size="sm"
                  variant="outline"
                  disabled={busyId === section.id}
                  onClick={() => void createRps(section.id)}
                >
                  {busyId === section.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FilePlus2 />
                  )}
                  Buat versi RPS
                </Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function PlatformApp() {
  const [access, setAccess] = useState<AccessContext | null>(null);
  const [data, setData] = useState<PlatformData | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [editorId, setEditorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await api.get<PlatformData>("/api/platform");
      setAccess(next.access);
      setData(next);
      setError("");
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Workspace gagal dimuat.";
      if (message.includes("masuk")) {
        setAccess(null);
        setData(null);
      } else setError(message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    api
      .get<PlatformData>("/api/platform")
      .then((next) => {
        if (!alive) return;
        setAccess(next.access);
        setData(next);
      })
      .catch((reason) => {
        if (!alive) return;
        const message =
          reason instanceof Error ? reason.message : "Workspace gagal dimuat.";
        if (!message.includes("masuk")) setError(message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const logout = async () => {
    await api.send("/api/auth/sign-out", "POST").catch(() => undefined);
    setAccess(null);
    setData(null);
  };
  if (loading && !data)
    return (
      <div className="grid min-h-svh place-items-center bg-[#f3f6f8]">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          Menghubungkan workspace…
        </div>
      </div>
    );
  if (!access || !data) return <Login onSuccess={() => void load()} />;
  if (editorId)
    return (
      <PlatformEditor
        rpsId={editorId}
        access={access}
        ai={data.ai}
        onBack={() => {
          setEditorId("");
          setView("rps");
        }}
        onChanged={load}
      />
    );
  const isAdmin = access.roles.some((role) =>
    ["SUPERADMIN", "ADMIN_PRODI"].includes(role.code),
  );
  return (
    <div className="min-h-svh bg-[#f5f7f9]">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-white px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <img className="size-10 object-contain" src={undipLogo} alt="UNDIP" />
          <div className="text-sm font-semibold">RPS OBE Studio</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-xs font-semibold">{access.user.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {access.roles.map((role) => role.code).join(" · ")}
            </div>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Muat ulang"
            onClick={() => void load()}
          >
            <RefreshCw />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Keluar"
            onClick={() => void logout()}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r bg-white p-3 lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)]">
          <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            <Nav
              active={view === "dashboard"}
              icon={<LayoutDashboard />}
              label="Dashboard"
              onClick={() => setView("dashboard")}
            />
            <Nav
              active={view === "rps"}
              icon={<BookOpen />}
              label="Dokumen RPS"
              onClick={() => setView("rps")}
            />
            <Nav
              active={view === "outcomes"}
              icon={<BarChart3 />}
              label="Nilai & capaian"
              onClick={() => setView("outcomes")}
            />
            {isAdmin && (
              <Nav
                active={view === "master"}
                icon={<Building2 />}
                label="Master data"
                onClick={() => setView("master")}
              />
            )}
          </nav>
          <div className="mt-6 hidden border-t px-3 pt-4 text-xs text-muted-foreground lg:block">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${data.ai.configured ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              AI {data.ai.configured ? "aktif" : "belum dikonfigurasi"}
            </div>
            {data.ai.configured && (
              <p className="mt-1 truncate">{data.ai.model}</p>
            )}
          </div>
        </aside>
        <main className="min-w-0 p-4 lg:p-7">
          {error && (
            <Alert className="mb-5" variant="destructive">
              <CircleAlert />
              <AlertTitle>Workspace gagal diperbarui</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {view === "dashboard" ? (
            <Dashboard data={data} onOpenRps={setEditorId} />
          ) : view === "master" ? (
            <MasterData data={data} reload={load} />
          ) : view === "outcomes" ? (
            <OutcomesPage platform={data} />
          ) : (
            <RpsList data={data} reload={load} onOpen={setEditorId} />
          )}
        </main>
      </div>
    </div>
  );
}

function Nav({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-sm lg:w-full ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
      onClick={onClick}
    >
      {<span className="[&_svg]:size-4">{icon}</span>}
      {label}
    </button>
  );
}
