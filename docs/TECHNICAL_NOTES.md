# Lafal Studio

Browser-local automatic subtitles and caption editor. Static site; no paid API key or server upload. Portable static distribution for GitHub Pages.

## Features

- MP4/MOV/WebM import, 200 MiB and 10-minute limits, immediate processing.
- Single-thread FFmpeg WASM audio extraction; Web Audio fallback.
- Multilingual quantized Whisper Tiny in a dedicated worker, automatic language recognition or an explicit language choice, word timestamps, and caption segmentation.
- Two-column responsive editor, one canvas renderer for both preview and MP4 export, style presets, word highlighting, text/timing changes, undo/redo, SRT/VTT import.
- IndexedDB projects and source video, autosave, local project library, light/dark themes.
- SRT/VTT/TXT export and MP4 burn-in using canvas + MediaRecorder + original audio through Web Audio. FFmpeg transcodes when the browser only offers WebM recording. Background-tab export pauses and resumes.

## Runtime requirements and limits

Use a modern desktop browser with WebAssembly, IndexedDB, Canvas captureStream, Web Audio, and MediaRecorder. Downloads are required on first use: FFmpeg core (about 31 MB), Whisper Tiny model (about 75 MB), and tokenizers/config. Model assets come from huggingface.co and FFmpeg core from cdn.jsdelivr.net; Manrope from Google Fonts. Cache availability depends on the browser. Offline operation is not guaranteed.

Inference speed and accuracy depend on hardware, language, and audio quality. Tiny is intentionally lightweight; noisy Indonesian speech may need manual correction. Unsupported video codecs are converted with FFmpeg when possible. This is CPU intensive and browser memory limits can reject large files below the nominal upload limit. Exports are limited to a 1920-pixel long edge; original aspect ratio is preserved, with even dimensions for H.264. Browser encoding is real time. Audio/video synchronization can vary slightly by browser.

Caption word timestamps are real model output. After text or timing changes, within-caption word timings are proportionally redistributed. Imported subtitles and the explicitly labeled demo use proportional word timings. No fabricated transcript is substituted for a failed AI job.

Projects stay in the current browser profile and are not synced across devices. Source media and metadata are in separate IndexedDB stores so each text/style autosave does not rewrite the video. Clearing site data removes projects. Private/incognito mode and storage quotas can prevent persistence; the UI reports this.

## Checks

`npm run check` checks JavaScript syntax. `npm test` checks segmentation, timing preservation, subtitle formats, import validation, and export aspect ratios. Static `dist/` is the deployable directory. GitHub Pages uses the included workflow.

## Dependencies and attribution

- Transformers.js 2.17.2, Apache-2.0: https://github.com/huggingface/transformers.js
- ONNX Runtime Web 1.14.0, MIT: https://github.com/microsoft/onnxruntime
- FFmpeg wrapper 0.12.15, MIT: https://github.com/ffmpegwasm/ffmpeg.wasm
- FFmpeg core 0.12.10, loaded on demand; see upstream component licensing.
- Whisper Tiny, MIT: https://huggingface.co/Xenova/whisper-tiny
- Manrope font, SIL Open Font License: https://fonts.google.com/specimen/Manrope
- Demo landscape: https://images.unsplash.com/photo-1470770841072-f978cf4d019e (Unsplash image, Unsplash license).
- Demo narration synthesized with the installed Flite SLT voice; demo captions are authored sample content and visibly marked in the UI.

## Verification

The live local app was checked in desktop and 390-pixel mobile layouts. A real portrait-video drop passed the complete FFmpeg → Whisper → automatic editor flow. Text edit/Undo, style controls, autosave restoration, and dark mode were checked in the browser. A downloaded burn-in export was inspected using ffprobe: H.264 video at 1280×720, 30 fps, 12.000 seconds, with AAC audio. The captured subtitle frame matches the preview's word highlight. Browser file-picker automation was unavailable during part of QA; the drop route was exercised using a local controlled fixture. QA fixtures are excluded from deployment.
