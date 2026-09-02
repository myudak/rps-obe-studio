RPS OBE STUDIO UNDIP — PORTABLE MVP v0.4.0
=====================================

CARA MEMBUKA
1. Ekstrak seluruh isi ZIP.
2. Klik dua kali RPS-OBE-Studio.html.
3. Aplikasi berjalan lokal di browser; tidak perlu instalasi atau server.

CARA MEMULAI
- Klik "Muat contoh" untuk melihat contoh Dasar Pemrograman, atau isi dari awal.
- RPS, chat, dan preferensi tersimpan otomatis di IndexedDB browser/perangkat yang sedang dipakai.
- Gunakan "Simpan JSON" sebagai backup dan "Buka JSON" untuk melanjutkan di perangkat lain.
- Gunakan "Storage & Privacy" untuk backup/pulihkan seluruh workspace dan meminta persistent storage.
- Buka langkah Finalisasi untuk Print/PDF mixed A4 portrait-landscape, HTML dokumen, JSON, atau DOCX.

AI / OPENROUTER
- Model awal adalah z-ai/glm-5.3-flash. Buka "AI & Model", masukkan API key pribadi, lalu muat/pilih model bila ingin menggantinya.
- API key dapat disimpan hanya di tab, sampai sesi browser ditutup, atau terenkripsi di perangkat dengan PIN.
- Vault memakai AES-256-GCM dan PBKDF2-SHA256 600.000 iterasi. PIN tidak disimpan dan harus dimasukkan lagi setelah reload.
- Panel "Asisten RPS" mendukung chat streaming dan jawaban Markdown. Riwayat chat tersimpan lokal; credential dikelola terpisah dan tidak masuk backup/output.
- Konteks ringkas RPS dan 12 pesan terakhir dikirim ke OpenRouter/provider hanya ketika fitur AI digunakan.
- Quick action menghasilkan preview draft terstruktur. Selalu tinjau sebelum menekan "Terapkan".
- Draft yang sudah kedaluwarsa karena RPS berubah harus dibuat ulang dan tidak dapat diterapkan.

CATATAN
- CPL resmi, referensi, bobot, nama validator, dan kebijakan akademik tetap wajib dicek manusia.
- Bila browser membatasi request API dari file lokal, aplikasi dan seluruh editor/export non-AI tetap bekerja. Jalankan melalui web server lokal untuk memakai AI pada browser tersebut.
- HTML adalah format output utama; DOCX dibuat di browser menggunakan docx.js.
- Backup workspace tidak pernah memuat API key. Pertahankan nama/lokasi file HTML agar origin storage tetap sama.

Source project: folder rps-obe-studio
