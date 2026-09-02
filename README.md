<p align="center"><img src="src/assets/logo-undip.png" alt="Logo Universitas Diponegoro" width="110"></p>

<p align="center"><a href="https://myudak.github.io/rps-obe-studio/">Buka aplikasi</a> · <a href="https://github.com/myudak/rps-obe-studio/actions">Status deployment</a></p>

# RPS OBE Studio

MVP editor Rencana Pembelajaran Semester berbasis OBE untuk Departemen Informatika, Fakultas Sains dan Matematika, Universitas Diponegoro. Aplikasi berjalan sepenuhnya di browser, menyimpan draft di perangkat, dapat meminta draft terstruktur dari model OpenRouter, lalu mengekspor dokumen RPS sebagai HTML mandiri.

## Fitur MVP

- Editor bertahap: identitas, CPL/CPMK, matriks alignment, jadwal 16 minggu, assessment, rubrik, dan validasi.
- Quality check deterministik untuk kelengkapan, kata kerja Bloom, bobot 100%, mapping, dan cakupan assessment.
- Chat OpenRouter dengan respons streaming dan Markdown aman; konteks memakai snapshot ringkas RPS serta 12 pesan terakhir.
- Quick action AI menghasilkan draft terstruktur yang divalidasi dengan JSON Schema dan selalu memerlukan persetujuan sebelum diterapkan.
- Autosave RPS, chat, dan preferensi melalui IndexedDB; data lama dari `localStorage` dimigrasikan otomatis satu kali.
- Tiga mode API key: hanya tab, `sessionStorage`, atau vault lokal terenkripsi dengan PIN.
- Backup/restore workspace dan permintaan persistent storage dari browser; credential tidak pernah masuk backup.
- Import/export JSON, standalone HTML, Print/PDF, dan DOCX menggunakan `docx`/docx.js.
- Build produksi menjadi satu `index.html` yang dapat dibuka langsung tanpa server.
- Contoh bawaan menggunakan Dasar Pemrograman (`MIK1624102`, 3 SKS) dan identitas UNDIP/FSM/Informatika.

## Menjalankan pengembangan

Persyaratan: Node.js 20.19+ dan npm.

```bash
npm install
npm run dev
```

Build portable:

```bash
npm run build
```

Hasilnya berada di `dist/index.html`. Untuk distribusi, cukup berikan file HTML tersebut atau ZIP portable yang tersedia di folder induk proyek.

## Cara memakai AI

1. Buka **AI & Model**.
2. Masukkan OpenRouter API key pribadi dengan spending limit.
3. Model awal adalah `z-ai/glm-5.3-flash`. Muat katalog untuk memilih model lain atau ketik slug secara manual.
4. Gunakan panel **Asisten RPS** untuk berdiskusi, atau tekan **Bantu dengan AI** pada bagian yang diinginkan.
5. Periksa preview draft lalu pilih **Terapkan** atau **Tolak**. Draft otomatis dinonaktifkan jika RPS berubah setelah draft dibuat.

Pilih mode penyimpanan API key sesuai perangkat:

- **Hanya tab ini**: key hilang saat halaman dimuat ulang.
- **Sampai browser ditutup**: key berada di `sessionStorage` dan hilang ketika sesi browser berakhir.
- **Terenkripsi di perangkat**: key disimpan sebagai ciphertext AES-256-GCM di IndexedDB. Kunci enkripsi diturunkan dari PIN/passphrase menggunakan PBKDF2-SHA256 600.000 iterasi; PIN dan hasil dekripsi hanya berada di memory dan harus dimasukkan lagi setelah reload.

API key tidak pernah dimasukkan ke JSON RPS, backup workspace, atau HTML hasil ekspor. Saat AI digunakan, konteks RPS dikirim ke OpenRouter dan provider model yang dipilih. Untuk deployment bersama/multi-user, pindahkan panggilan OpenRouter ke backend/proxy agar key institusi tidak berada di browser.

## Penyimpanan dan backup

- Buka **Storage & Privacy** untuk melihat status autosave, estimasi penggunaan, dan retention browser.
- **Aktifkan penyimpanan permanen** meminta browser agar origin tidak dibersihkan otomatis; browser tetap berhak menolak.
- **Backup workspace** mencakup RPS, chat, dan preferensi non-secret. API key sengaja dikecualikan.
- Untuk versi portable `file://`, pertahankan nama dan lokasi file HTML. Memindahkan file atau memakai private browsing dapat menghasilkan origin/storage yang berbeda.

## Implementasi DOCX

Exporter memakai `docx` 9.7 (docx.js). Data RPS diubah menjadi objek `Document`, `Table`, `TableRow`, `TableCell`, dan `Paragraph`; jadwal ditempatkan pada section landscape, lalu `Packer.toBlob()` menghasilkan OOXML/DOCX langsung di browser. Pendekatan ini menggantikan ZIP/XML manual pada versi awal.

Jika tahap berikutnya wajib mempertahankan layout sebuah file Word resmi secara sangat presisi, gunakan Docxtemplater dengan placeholder dan loop pada salinan template `.docx`. Trade-off-nya: aplikasi perlu membawa/memuat file template, dan beberapa fitur tabel/gambar tingkat lanjut merupakan modul berbayar.

## Batas MVP

- Fokus pada penyusunan RPS, belum mencakup akun, approval workflow, version history terpusat, atau database server. IndexedDB hanya menyimpan workspace lokal pada browser/perangkat tersebut.
- HTML adalah output utama dan paling stabil. DOCX dibuat client-side dengan docx.js; layout masih dapat sedikit berbeda antara Microsoft Word, LibreOffice, dan Google Docs.
- CPL resmi, identitas, referensi, dan kebijakan akademik tetap harus diverifikasi manusia.

## Stack

React 19, TypeScript 6, Vite 8, Tailwind CSS 4, shadcn/ui preset `b3f0SOrXVY` (Base UI, Mist, Geist/Inter, Hugeicons), Zustand, Zod, IndexedDB melalui `idb`, Web Crypto, OpenRouter REST API, `react-markdown`, `remark-gfm`, `eventsource-parser`, docx.js 9.7, dan `vite-plugin-singlefile`.
