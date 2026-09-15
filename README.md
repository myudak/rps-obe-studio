<p align="center"><img src="src/assets/logo-undip.png" alt="Logo Universitas Diponegoro" width="110"></p>

# RPS OBE Studio

Workspace end-to-end untuk mengelola Rencana Pembelajaran Semester berbasis OBE di FSM Informatika, Universitas Diponegoro. Aplikasi sekarang memiliki dua runtime:

- **Platform mode**: Fastify + TypeScript, PostgreSQL, Drizzle ORM, Better Auth, role-based access, lifecycle RPS, audit log, dan AI SDK/OpenRouter di server.
- **Portable mode**: editor browser-only lama tetap tersedia, memakai IndexedDB dan menghasilkan satu file `dist/index.html`. Jika backend tidak terdeteksi, UI otomatis masuk ke mode ini. Gunakan `?portable=1` untuk memaksanya.

## Yang sudah tersedia di platform mode

- Login dan session Better Auth.
- Peran `SUPERADMIN`, `ADMIN_PRODI`, `KAPRODI`, `GPM`, `DOSEN_PENGAMPU`, dan `MAHASISWA`, dengan scope program studi.
- Master data program studi, periode, kurikulum, angkatan/cohort, mata kuliah, penempatan kurikulum, dan kelas.
- Dokumen RPS tersimpan di PostgreSQL, diedit memakai editor lima langkah yang sama, dan autosave ke server.
- Lifecycle `draft → submitted → verified` atau `needs_revision`, dengan quality check deterministik pada server sebelum submit.
- OpenRouter melalui Vercel AI SDK di server. Chat mendukung streaming; draft terstruktur disimpan sebagai proposal dan hanya diterapkan setelah approval user.
- Proteksi stale proposal menggunakan hash snapshot RPS, serta audit log untuk perubahan penting.
- Gradebook per kelas: sinkronisasi assessment dari RPS Verified, input/release nilai, calculation run capaian CPMK berbobot, dan finding CQI otomatis saat capaian kelas di bawah target.
- Fondasi data mahasiswa, enrollment, assessment, nilai, calculation run, pencapaian CPMK/CPL, dan CQI tersimpan sebagai histori terpisah di PostgreSQL.
- Drizzle Studio tersedia hanya sebagai alat developer, bukan sebagai admin UI pengguna.

## Menjalankan secara lokal

Persyaratan: Node.js 20.19+ (Node.js 22 direkomendasikan), pnpm 11, dan Docker Desktop atau PostgreSQL lokal.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Buka `http://localhost:5173`. Akun seed:

API berjalan di `http://localhost:3001`. `docker compose` memetakan PostgreSQL ke port host `5433` agar tidak berbenturan dengan instalasi PostgreSQL default di port 5432.

| Peran | Email | Password |
|---|---|---|
| Superadmin | `admin@rps.local` | `Admin123!` |
| Dosen | `dosen@rps.local` | `Dosen123!` |
| GPM | `gpm@rps.local` | `GpmDemo123!` |
| Mahasiswa | `mahasiswa@rps.local` | `Mahasiswa123!` |

Untuk mengaktifkan AI server, isi `OPENROUTER_API_KEY` di `.env`. Browser tidak menerima atau menyimpan key tersebut. Model default dapat diganti melalui `OPENROUTER_MODEL`.

## Perintah penting

```bash
pnpm dev              # Fastify dan Vite bersamaan
pnpm dev:api          # hanya API pada port 3001
pnpm dev:web          # hanya Vite pada port 5173
pnpm db:generate      # generate SQL migration dari schema
pnpm db:migrate       # jalankan migration
pnpm db:seed          # isi data dan akun demo secara idempotent
pnpm db:studio        # Drizzle Studio untuk developer
pnpm lint
pnpm build
```

`pnpm build` memeriksa tipe backend, memeriksa tipe frontend, lalu membangun portable single-file app di `dist/index.html`. Build statis lama tetap deployable ke GitHub Pages; platform mode memerlukan backend dan PostgreSQL jika nanti deployment server mulai dibahas.

Jika database lokal ingin dihentikan tanpa menghapus volumenya, jalankan `pnpm db:down`. Data PostgreSQL tetap berada di Docker volume `rps_obe_postgres`; penghapusan volume bukan bagian dari perintah tersebut.

## Struktur utama

- `server/index.ts` — bootstrap Fastify dan error handling.
- `server/db/schema.ts` — schema PostgreSQL/Drizzle untuk auth dan domain OBE.
- `server/routes/platform-routes.ts` — dashboard dan master data.
- `server/routes/rps-routes.ts` — CRUD dan lifecycle RPS.
- `server/routes/ai-routes.ts` — streaming chat dan proposal AI server-side.
- `server/scripts/seed.ts` — data akademik serta akun demo.
- `src/platform/` — shell login, dashboard, admin, daftar RPS, dan editor server-backed.
- `src/AppV2.tsx` — aplikasi portable/browser-only yang tetap dipertahankan.
- `drizzle/` — migration SQL yang dapat diaudit dan diulang.

## Guardrail penting

- AI tidak menulis langsung ke RPS. Structured output divalidasi, ditampilkan sebagai proposal, dan perlu approval eksplisit.
- Proposal otomatis menjadi stale jika data RPS berubah sejak proposal dibuat.
- API key OpenRouter hanya dibaca dari environment backend dan tidak masuk database, export, atau browser bundle.
- Endpoint mutation memeriksa session, role, dan scope program studi; UI bukan batas keamanan.
- Quality check tetap deterministik dan terpisah dari output model.

## Portable editor

Mode portable mempertahankan autosave IndexedDB, local credential vault, chat OpenRouter dari browser, import/export JSON, HTML, Print/PDF, serta DOCX. Build ini tetap berguna untuk distribusi offline atau GitHub Pages, tetapi tidak menyediakan akun, database bersama, atau approval workflow lintas pengguna.

## Workspace akademik

- Navigasi memakai hash URL agar refresh/back tetap bekerja tanpa konfigurasi server statis. Mode development menampilkan error backend; gunakan `?portable` untuk memilih editor offline secara eksplisit.
- Login menampilkan error terstruktur. Autosave RPS memakai `revision` dan header `If-Match`; konflik tidak menimpa perubahan server. UI menyediakan retry, muat versi server, dan ekspor salinan lokal.
- Persetujuan berurutan GPM → Kaprodi, dengan riwayat putaran. Penulis tidak dapat mereview sendiri. Data verified existing dipertahankan; pending existing mulai dari GPM.
- Kelas mendukung edit identitas/status/kapasitas, penugasan dosen, daftar peserta, dan impor. Relasi akademik kelas existing tidak dipindahkan melalui edit.
- Impor CSV/XLSX memakai preview server 15 menit, lalu commit atomik setelah validasi ulang. Maksimal 1.000 baris / 2 MB. `kode_angkatan` adalah tahun masuk angkatan kelas; NIM harus berupa teks. Nilai released tidak dapat ditimpa; overwrite draft perlu konfirmasi. Preview tersimpan sementara dalam proses API dan hilang jika API restart.
- CQI menyimpan rencana aksi, penanggung jawab, tenggat, riwayat, dan bukti. Penutupan/pengembalian membutuhkan reviewer dan komentar. Lampiran PDF/PNG/JPEG maksimal 10 MB disimpan di `.data/cqi-evidence`, bukan folder publik. Backup database perlu disertai backup direktori ini.
- Chat editor dapat diciutkan, diubah lebarnya, atau diperbesar. Percakapan dan input disimpan per pengguna/RPS dalam session storage; tidak memuat kredensial. Stream backend berupa NDJSON `text`, `error`, dan `done` serta mendukung pembatalan.

## Pengujian PostgreSQL terisolasi

Pengujian integrasi menolak database selain `rps_obe_test`. Database ini terpisah dari data aplikasi dan berisi fixture sintetis dengan ID unik.

```powershell
# Sekali saja, jika database belum ada:
docker compose exec -T postgres psql -U rps_obe -d postgres -c "CREATE DATABASE rps_obe_test;"
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://rps_obe:rps_obe@localhost:5433/rps_obe_test'
  pnpm db:migrate
  pnpm test
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
pnpm lint
pnpm build
```

Suite memeriksa normalisasi error, login/logout, scope program, impor CSV/XLSX, duplikasi dan overwrite, optimistic concurrency, revisi dan persetujuan dua tahap, self-approval, keputusan bersamaan, rilis nilai, privasi mahasiswa, perhitungan, CQI, serta otorisasi lampiran. Tidak ada deployment yang dijalankan oleh pengujian.

Logo `src/assets/logo-undip.png` diperbaiki dari referensi pengguna menggunakan imagegen bawaan. Instruksi edit: hapus hanya latar putih di luar batas lambang; pertahankan warna putih di bagian dalam, tulisan, bentuk, dan rasio lambang. Area luar memiliki alpha transparan sehingga tidak memerlukan latar kotak putih pada sidebar navy.
