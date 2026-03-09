## AI Reel Generator

Web app that turns a **PDF/PPTX** into a short-form vertical video reel:

- **Text extraction**: `pdf-parse-fixed`, `pptx-parser`
- **Script generation**: Google Gemini (`gemini-2.5-flash`)
- **Voiceover**: ElevenLabs Text-to-Speech
- **Render**: `ffmpeg` via `fluent-ffmpeg`

### Setup

- Install dependencies:

```bash
npm i
```

- Create `.env.local` (see `.env.example`):
  - `GEMINI_API_KEY`
  - `ELEVEN_API_KEY`

- Ensure **ffmpeg is installed and on PATH** (this project uses `ffmpeg` from your system).

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### API Endpoints

- **Single-step pipeline**: `POST /api/generate-reel`
  - Body: `multipart/form-data` with `file` (PDF/PPTX)
  - Runs: upload → extract → (cached) script → voice → render
  - Returns: `{ videoUrl, audioUrl, reelScript, cachedScript }`
  - Script cache stored at: `uploads/cache/script-<hash>.json`

- **Legacy step-by-step endpoints**
  - `POST /api/generate` → upload + extract text
  - `POST /api/script` → Gemini script JSON
  - `POST /api/voice` → ElevenLabs MP3
  - `POST /api/render` → ffmpeg render (includes burned-in SRT subtitles)
