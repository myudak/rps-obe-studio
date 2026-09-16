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
- Workspace object-centric untuk mata kuliah dan kurikulum: library CPL, CPMK/Sub-CPMK, mapping I/R/M, coverage heatmap, radar aktual-vs-target, perjalanan capaian lintas periode, proposal perubahan, impact summary, dan carry-forward RPS.
- Perhitungan CPL mata kuliah memakai data nilai released: capaian CPMK digabung dengan level mapping CPL dan bobot kontribusinya. Parameter formula dan hasil setiap run disimpan untuk audit; chart tidak memakai data contoh.
- Admin Studio untuk superadmin: status koneksi PostgreSQL, health check akademik, manajemen akun dan role per program, database browser dengan detail record dan relasi dua arah, audit log, serta demo scenario yang dapat diisi dan di-reset tanpa menyentuh data lain.
- Impersonation akun non-admin melalui Better Auth dengan alasan wajib, banner yang selalu terlihat, batas sesi 30 menit, tombol kembali ke akun admin, dan audit untuk mulai/berhenti impersonation.
- Drizzle Studio tetap tersedia sebagai alat developer. Operasi admin harian dilakukan melalui Admin Studio agar aksesnya mengikuti guardrail aplikasi.

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

API berjalan di `http://localhost:3001`. `docker compose` memetakan PostgreSQL ke port host `5433` agar tidak berbenturan dengan instalasi PostgreSQL default di port 5432.

Buka `http://localhost:5173`. Akun seed:

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
- `server/routes/admin-studio-routes.ts` — health/schema overview, user/role management, dan demo scenario khusus superadmin.
- `server/routes/outcome-system-routes.ts` — workspace kurikulum/mata kuliah, outcome mapping, proposal perubahan, dan carry-forward.
- `server/routes/outcome-routes.ts` — assessment, nilai, calculation run CPMK/CPL, serta pemicu CQI.
- `server/routes/rps-routes.ts` — CRUD dan lifecycle RPS.
- `server/routes/ai-routes.ts` — streaming chat dan proposal AI server-side.
- `server/scripts/seed.ts` — data akademik serta akun demo.
- `src/platform/AdminStudio.tsx` — panel operasional superadmin dan impersonation.
- `src/platform/OutcomeWorkspaces.tsx` — workspace kurikulum/mata kuliah, heatmap, radar, dan capaian longitudinal.
- `src/platform/` — shell login, dashboard, modul akademik, dan editor server-backed.
- `src/AppV2.tsx` — aplikasi portable/browser-only yang tetap dipertahankan.
- `drizzle/` — migration SQL yang dapat diaudit dan diulang.

## Guardrail penting

- AI tidak menulis langsung ke RPS. Structured output divalidasi, ditampilkan sebagai proposal, dan perlu approval eksplisit.
- Proposal otomatis menjadi stale jika data RPS berubah sejak proposal dibuat.
- API key OpenRouter hanya dibaca dari environment backend dan tidak masuk database, export, atau browser bundle.
- Endpoint mutation memeriksa session, role, dan scope program studi; UI bukan batas keamanan.
- Quality check tetap deterministik dan terpisah dari output model.
- Impersonation tidak dapat menargetkan superadmin/admin prodi, tidak dapat dijalankan ketika sedang impersonating, memerlukan alasan, dan identitas admin asli ikut dicatat pada audit mutation.
- Database browser membaca 35 tabel dari schema Drizzle, menampilkan tipe, foreign key, isi record, serta relasi masuk/keluar. Nilai password/token tetap disembunyikan. Edit field master menggunakan allowlist, validasi, audit, dan revision check; record yang masih digunakan tidak dapat dihapus. Data auth, approval, nilai released, dan hasil perhitungan dikelola melalui workflow khusus.
- Reset demo memakai manifest ID yang dibuat scenario tersebut, sehingga tidak menjadi tombol hapus data produksi.

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
- CPL dan CPMK tidak lagi diasumsikan selalu berjumlah tetap. Portable editor menerima 1–10 CPL, 1–20 CPMK, sampai 30 assessment/rubrik, dan sampai 20 referensi; relasi dibersihkan ketika baris dihapus. Jadwal tetap 16 pertemuan sesuai format semester yang dipakai aplikasi.

## Admin Studio dan demo data

UI menggunakan preset shadcn `bJysiAn4S` (Nova/neutral/sky, Geist + Inter). Font dibundel oleh Vite. Header menyediakan breadcrumb, filter konteks, dan menu akun. Login memakai adaptasi login-02 dengan foto abstrak Unsplash berlapis biru; foto membutuhkan internet, tetapi form tetap berfungsi dengan latar biru jika foto gagal dimuat. Preset tidak menambah SSO atau fitur autentikasi baru.

Masuk sebagai superadmin lalu buka `#/admin`. Tab yang tersedia:

- **Overview** menampilkan health database dan anomali akademik yang perlu ditindaklanjuti.
- **Users & Access** membuat/memperbarui akun, status, ban, dan role yang memiliki scope program. Gunakan aksi **Impersonate**, isi alasan, lalu gunakan banner atas untuk kembali ke akun admin.
- **Academic Data** membuka tabel/form master data yang sama dengan workflow utama sehingga validasi relasinya tetap konsisten.
- **Demo Scenarios** menyediakan paket `full-academic`: 6 mata kuliah, 12 kelas, 2 periode, 24 mahasiswa, 12 RPS (8 verified, 2 submitted, 2 draft), 576 nilai released, 8 calculation run, CPL/CPMK/Sub-CPMK, curriculum map, dan tindak lanjut CQI. Grafik menggunakan endpoint perhitungan asli, bukan angka UI palsu. Paket kecil `outcome-library` dan `cqi-gap` tetap tersedia. Reset hanya menghapus ID pada manifest; paket yang gagal diselesaikan dapat di-reset sebelum dicoba lagi.
- **Audit Log** menampilkan actor, impersonator, aksi, dan entity yang berubah.
- **Database & Relasi** menampilkan koneksi PostgreSQL aktual, seluruh tabel, pencarian/pagination/sort, tipe kolom dan indeks. Klik nama record untuk drawer detail; klik relasi untuk membuka record tujuan atau semua record yang menggunakannya. Field master bisa diedit dan record tidak terpakai bisa dihapus dengan konfirmasi. Tambah program/periode/kurikulum/angkatan/mata kuliah/kelas tersedia langsung dalam drawer, memakai form dan validasi server yang sama dengan aplikasi. Untuk SQL developer gunakan `pnpm db:studio` secara lokal.

Admin Studio tidak menyediakan raw SQL atau truncate. Record yang sudah dipakai harus dikelola melalui workflow/arsip. Sidebar memakai shadcn sidebar-02 dengan grup collapsible dan navigasi mobile; drawer record/akun menggunakan komponen shadcn asli.

Untuk melihat demo: buka **Admin Studio → Demo Scenarios → Isi demo lengkap**, lalu pilih **Informatika — Demo Akademik** pada filter prodi. Buka **Mata Kuliah** untuk radar CPL dan **Kurikulum & CPL** untuk curriculum map. Pilih semua periode untuk melihat kedua kelas per mata kuliah. Data demo disimpan hanya pada PostgreSQL lokal, bukan portable mode.

## Model outcome dan formula CPL

`curriculum_outcome` menyimpan CPL resmi per kurikulum. `course_outcome` dan `sub_outcome` menyimpan CPMK/Sub-CPMK per penempatan mata kuliah dalam kurikulum. `course_outcome_mapping` menghubungkan CPMK ke CPL dengan level 1/2/3 (I/R/M) dan bobot kontribusi; `assessment_outcome_mapping` menghubungkan assessment tersinkronisasi ke CPMK.

Calculation run versi pertama memakai nilai assessment released untuk menghitung CPMK mahasiswa/kelas. CPL lalu dihitung sebagai rerata tertimbang CPMK yang terhubung, dengan bobot `max(bobot CPMK, 1) × level mapping × kontribusi`. Target berasal dari CPL kurikulum. Semua hasil disimpan sebagai achievement baru—run lama tidak ditimpa—sehingga workspace dapat membandingkan kelas/periode dan menghubungkan gap ke CQI.

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

Suite memeriksa normalisasi error, login/logout, scope program, impor CSV/XLSX, duplikasi dan overwrite, optimistic concurrency, revisi dan persetujuan dua tahap, self-approval, keputusan bersamaan, rilis nilai, privasi mahasiswa, perhitungan CPMK/CPL, workspace outcome, Sub-CPMK, proposal governance, carry-forward, CQI, otorisasi lampiran, Admin Studio, create/update user, demo reset, serta impersonate/stop dan larangan impersonasi admin. Tidak ada deployment yang dijalankan oleh pengujian.

Logo `src/assets/logo-undip.png` diperbaiki dari referensi pengguna menggunakan imagegen bawaan. Instruksi edit: hapus hanya latar putih di luar batas lambang; pertahankan warna putih di bagian dalam, tulisan, bentuk, dan rasio lambang. Area luar memiliki alpha transparan sehingga tidak memerlukan latar kotak putih pada sidebar navy.
