# Lafal Studio — Full Project untuk GitHub Pages

Website auto caption dengan alur **Upload → Proses → Edit & Ekspor**. Paket ini sudah memakai jalur aset relatif, sehingga bisa berjalan di alamat project GitHub Pages seperti `https://USERNAME.github.io/lafal-caption-studio/`.

Mulai dari **[PANDUAN_HOSTING_GITHUB_PAGES.txt](PANDUAN_HOSTING_GITHUB_PAGES.txt)** untuk langkah melalui browser tanpa CMD.

## Isi proyek

| Lokasi | Kegunaan |
| --- | --- |
| `dist/index.html` | Halaman upload, proses, editor, dan ekspor |
| `dist/app.js` | Alur aplikasi, pengeditan, dan render video |
| `dist/core.js` | Pemenggalan caption, waktu kata, renderer bersama, dan format subtitle |
| `dist/media.js` | FFmpeg, ekstraksi audio, dan konversi MP4 |
| `dist/transcribe-worker.js` | Whisper multilingual pada worker browser |
| `dist/storage.js` | Autosave proyek dan video melalui IndexedDB |
| `dist/styles.css` | Tampilan responsif, tema terang, dan dark mode |
| `dist/assets/` | Ikon, gambar, video contoh, dan caption contoh |
| `dist/vendor/` | Transformers.js, ONNX WASM, wrapper FFmpeg, serta lisensinya |
| `.github/workflows/deploy-pages.yml` | Workflow publikasi GitHub Pages |
| `deploy-pages.yml` | Salinan workflow yang mudah dibuka dan disalin saat upload lewat browser |
| `scripts/serve.mjs` | Server preview lokal, tanpa dependensi npm tambahan |
| `tests/core.test.js` | Tes pemenggalan, waktu, format subtitle, dan rasio ekspor |
| `docs/TECHNICAL_NOTES.md` | Arsitektur, dependensi, atribusi, dan keterbatasan |

## Hosting

1. Buat repository Public, misalnya `lafal-caption-studio`.
2. Atur **Settings → Pages → Source → GitHub Actions**.
3. Upload isi folder proyek dan commit ke `main`.
4. Pastikan file `.github/workflows/deploy-pages.yml` tersimpan di lokasi tersebut. Untuk membuatnya lewat browser, salin isi `deploy-pages.yml` dari folder utama paket.
5. Buka tab Actions dan tunggu workflow **Deploy Lafal Studio to GitHub Pages** selesai. Buka alamat deployment yang ditampilkan GitHub.

Website yang diterbitkan melalui GitHub Pages biasanya dapat diakses publik. Video upload, teks edit, dan proyek autosave diproses serta disimpan di browser pengguna; kode aplikasi tidak mengirimnya ke repository.

## Menjalankan lokal, opsional

Node.js 20 atau lebih baru diperlukan hanya untuk preview lokal dan pemeriksaan. Hosting melalui browser GitHub tidak memerlukan instalasi Node.js di laptop.

```bash
npm run dev
```

Buka `http://localhost:5173/`. Paket ini tidak memerlukan `npm install` untuk menjalankan server preview karena memakai modul bawaan Node.js dan library browser sudah disertakan.

Simulasi URL repository:

```bash
npm run dev -- --base /lafal-caption-studio/
```

Pemeriksaan:

```bash
npm run check
npm test
```

## Cara kerja dan batasan

- MP4, MOV, dan WebM; maksimal 200 MB dan 10 menit per video. Dukungan codec dan memori mengikuti browser/perangkat.
- Whisper Tiny multilingual berjalan di browser, tanpa API key. Teks dan waktu kata dari AI dapat dikoreksi di editor.
- Model Whisper sekitar 75 MB dan FFmpeg core sekitar 31 MB diunduh ketika pertama diperlukan. Font dimuat melalui Google Fonts. Koneksi internet diperlukan; ketersediaan cache mengikuti browser.
- Preview dan burn-in memakai renderer canvas yang sama. Ekspor video memakai MediaRecorder, dengan FFmpeg sebagai pengemas H.264/AAC ketika codec rekaman browser memerlukannya.
- Ukuran ekspor dibatasi sisi terpanjang 1920 piksel, mempertahankan rasio asli dan menghindari pembesaran sumber kecil.
- GitHub Pages menyajikan website. Pengenalan ucapan dan render tetap memakai perangkat pengunjung, sehingga tab harus tetap terbuka selama proses.
- Autosave ada di profil browser/perangkat yang digunakan. Data proyek belum tersinkron antarperangkat.
- Setelah teks atau waktu caption diedit, waktu kata di dalam caption dibagi ulang secara proporsional. Demo dan impor SRT/VTT juga memakai pembagian waktu kata proporsional.

## Dependensi dan atribusi

Lisensi library yang didistribusikan ada di `dist/vendor/licenses/`. Referensi model, FFmpeg core, font, dan foto contoh ada di [catatan teknis](docs/TECHNICAL_NOTES.md). Pertahankan file lisensi dan atribusi saat membagikan proyek.

## Rujukan hosting

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
