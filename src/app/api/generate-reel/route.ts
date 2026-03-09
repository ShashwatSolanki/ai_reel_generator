import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import { v4 as uuidv4 } from "uuid";
import { extractText } from "@/lib/extract";

export const runtime = "nodejs";

type ReelScene = {
  sceneNumber: number;
  narration: string;
  caption: string;
  durationInSeconds: number;
};

type ReelScript = {
  title: string;
  totalDuration?: number;
  scenes: ReelScene[];
};

type QuotaState = {
  date: string;
  count: number;
};

const MAX_PER_DAY =
  Number(process.env.REELS_PER_DAY_LIMIT || "") > 0
    ? Number(process.env.REELS_PER_DAY_LIMIT)
    : 20;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Format seconds → SRT timestamp
function formatTime(seconds: number) {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
}

function safeJsonFromModelText(text: string) {
  // Best-effort: Gemini sometimes wraps JSON in markdown/code fences.
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) throw new Error("Model did not return JSON");
    return JSON.parse(text.slice(start, end));
  }
}

async function readAndBumpQuota() {
  const cacheDir = path.join(process.cwd(), "uploads", "cache");
  const quotaPath = path.join(cacheDir, "quota.json");

  if (!fs.existsSync(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }

  let state: QuotaState = { date: today(), count: 0 };

  if (fs.existsSync(quotaPath)) {
    try {
      const raw = await readFile(quotaPath, "utf8");
      state = JSON.parse(raw);
    } catch {
      state = { date: today(), count: 0 };
    }
  }

  if (state.date !== today()) {
    state = { date: today(), count: 0 };
  }

  if (state.count >= MAX_PER_DAY) {
    const remaining = 0;
    return {
      allowed: false,
      state,
      quota: {
        maxPerDay: MAX_PER_DAY,
        used: state.count,
        remaining,
      },
      quotaPath,
    };
  }

  state.count += 1;
  await writeFile(quotaPath, JSON.stringify(state, null, 2), "utf8");

  const remaining = Math.max(0, MAX_PER_DAY - state.count);

  return {
    allowed: true,
    state,
    quota: {
      maxPerDay: MAX_PER_DAY,
      used: state.count,
      remaining,
    },
    quotaPath,
  };
}

async function generateScriptWithGemini(inputText: string): Promise<ReelScript> {
  // Dev shortcut: allow testing without spending a Gemini call.
  // Set MOCK_REEL=1 in .env.local to use this hard-coded script.
  if (process.env.MOCK_REEL === "1") {
    const mock: ReelScript = {
      title: "This PDF in 30 seconds",
      totalDuration: 30,
      scenes: [
        {
          sceneNumber: 1,
          narration: "Wait, before you scroll, this might actually save you time.",
          caption: "Before you scroll…",
          durationInSeconds: 4,
        },
        {
          sceneNumber: 2,
          narration:
            "I went through your document and pulled out just the stuff you actually care about.",
          caption: "I read it for you 👀",
          durationInSeconds: 5,
        },
        {
          sceneNumber: 3,
          narration:
            "Here’s the core idea in one line: make it simple, make it repeatable, and don’t overthink it.",
          caption: "Core idea in 1 line",
          durationInSeconds: 6,
        },
        {
          sceneNumber: 4,
          narration:
            "If you just focus on this one thing today, you’re already ahead of 90% of people who only skim.",
          caption: "Focus on ONE thing",
          durationInSeconds: 7,
        },
        {
          sceneNumber: 5,
          narration:
            "Save this so you don’t have to reopen that giant file again.",
          caption: "Save this, close the doc.",
          durationInSeconds: 8,
        },
      ],
    };
    return mock;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const prompt = `
You are an expert short-form content creator for TikTok and Instagram Reels.
Speak directly to the viewer in casual, modern language ("you", "your", etc.).
Do NOT mention PDFs, documents, slides, or that this is a summary. Just talk to the viewer.

Convert the core ideas from the text into an engaging ~30-second vertical reel script.
You can reorganize, simplify, or rephrase the content so it feels natural and story-like.

Return ONLY valid JSON in this exact format:

{
  "title": "Reel title",
  "totalDuration": 30,
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "Voiceover text",
      "caption": "On-screen caption",
      "durationInSeconds": 4
    }
  ]
}

Rules:
- 5 to 8 scenes
- First scene must be a strong, but not cringe, hook that makes the viewer stop scrolling
- Keep narration short, punchy, and conversational (imagine talking to a friend)
- Avoid jargon where possible; explain things simply
- Never say things like "in this PDF" or "in this document" or "the text says"
- Total duration ~30 seconds
- Output JSON only

TEXT:
${inputText}
`.trim();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("No content returned from Gemini");

  const parsed = safeJsonFromModelText(content) as ReelScript;
  if (!parsed?.scenes?.length) throw new Error("Invalid script: missing scenes");
  return parsed;
}

async function generateVoiceWithElevenLabs(scenes: ReelScene[], stableId: string) {
  const apiKey = process.env.ELEVEN_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVEN_API_KEY");

  const combinedText = scenes
    .map((s) => String(s?.narration || "").trim())
    .filter(Boolean)
    .join(" ");

  if (!combinedText) throw new Error("No narration text to synthesize");

  const voiceId = "JBFqnCBsd6RMkjVDRZzb";
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: combinedText,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    },
    {
      responseType: "arraybuffer",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
    }
  );

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const fileName = `voiceover-${stableId}.mp3`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, Buffer.from(response.data));

  return { audioPath: filePath, audioUrl: `/uploads/${fileName}` };
}

async function renderReel(audioPath: string, scenes: ReelScene[]) {
  ffmpeg.setFfmpegPath("ffmpeg");

  const backgroundPath = path.join(
    process.cwd(),
    "public",
    "backgrounds",
    "minecraft.mp4"
  );

  if (!fs.existsSync(backgroundPath)) {
    throw new Error(`Missing background video at ${backgroundPath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Missing audio at ${audioPath}`);
  }

  const outputDir = path.join(process.cwd(), "public", "renders");
  await mkdir(outputDir, { recursive: true });

  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `reel-${timestamp}.mp4`);
  const subtitlePath = path.join(outputDir, `subs-${timestamp}.srt`);

  const audioDuration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });

  if (!audioDuration) throw new Error("Could not determine audio duration");

  if (!scenes.length) {
    throw new Error("No scenes available to build subtitles");
  }

  // Evenly divide audio across scenes to build SRT subtitle timings
  const sceneDuration = audioDuration / scenes.length;

  let currentTime = 0;
  let srtContent = "";

  scenes.forEach((scene, index) => {
    const start = currentTime;
    const end = currentTime + sceneDuration;

    srtContent += `${index + 1}\n`;
    srtContent += `${formatTime(start)} --> ${formatTime(end)}\n`;
    srtContent += `${scene.caption}\n\n`;

    currentTime += sceneDuration;
  });

  fs.writeFileSync(subtitlePath, srtContent);

  // Avoid Windows drive-letter subtitle issues by working in the output dir
  process.chdir(outputDir);

  const subtitleFileName = path.basename(subtitlePath);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(backgroundPath)
      .inputOptions(["-stream_loop -1"])
      .input(audioPath)
      .outputOptions([
        `-t ${audioDuration}`,
        `-vf scale=1080:1920,subtitles='${subtitleFileName}'`,
        "-map 0:v:0",
        "-map 1:a:0",
        "-c:v libx264",
        "-c:a aac",
        "-shortest",
        "-y",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  return { videoUrl: `/renders/${path.basename(outputPath)}` };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    const allowedTypes = ["pdf", "pptx"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return NextResponse.json(
        { success: false, error: "Only PDF and PPTX files are allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });
    const uploadedPath = path.join(uploadDir, `${uuidv4()}.${fileExtension}`);
    await writeFile(uploadedPath, buffer);

    const extractedText = await extractText(uploadedPath);
    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "No text could be extracted" },
        { status: 400 }
      );
    }

    const cacheDir = path.join(process.cwd(), "uploads", "cache");
    await mkdir(cacheDir, { recursive: true });

    const stableId = sha256(extractedText.trim().slice(0, 50_000));
    const cachePath = path.join(cacheDir, `script-${stableId}.json`);

    let reelScript: ReelScript;
    let usedCache = false;
    if (fs.existsSync(cachePath)) {
      reelScript = JSON.parse(await readFile(cachePath, "utf8"));
      usedCache = true;
    } else {
      const quotaResult = await readAndBumpQuota();
      if (!quotaResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Daily reel limit reached. Try again tomorrow or increase REELS_PER_DAY_LIMIT.",
            quota: quotaResult.quota,
          },
          { status: 429 }
        );
      }

      reelScript = await generateScriptWithGemini(extractedText);
      await writeFile(cachePath, JSON.stringify(reelScript, null, 2), "utf8");
    }

    const { audioPath, audioUrl } = await generateVoiceWithElevenLabs(
      reelScript.scenes,
      stableId
    );

    const { videoUrl } = await renderReel(audioPath, reelScript.scenes);

    // If we generated a new script we already bumped quota.
    // If we hit cache, treat it as "no extra Gemini call" and keep quota unchanged.
    let quotaInfo = null as
      | {
          maxPerDay: number;
          used: number;
          remaining: number;
        }
      | null;

    if (!usedCache) {
      // Re-read quota file to get current values for the response payload.
      const quotaDir = path.join(process.cwd(), "uploads", "cache");
      const quotaPath = path.join(quotaDir, "quota.json");
      if (fs.existsSync(quotaPath)) {
        try {
          const raw = await readFile(quotaPath, "utf8");
          const state = JSON.parse(raw) as QuotaState;
          const remaining = Math.max(0, MAX_PER_DAY - state.count);
          quotaInfo = {
            maxPerDay: MAX_PER_DAY,
            used: state.count,
            remaining,
          };
        } catch {
          quotaInfo = null;
        }
      }
    }

    return NextResponse.json({
      success: true,
      reelScript,
      audioUrl,
      videoUrl,
      cachedScript: fs.existsSync(cachePath),
      quota: quotaInfo,
    });
  } catch (error: any) {
    console.error("generate-reel error:", error?.response?.data || error);
    return NextResponse.json(
      { success: false, error: String(error?.response?.data || error) },
      { status: 500 }
    );
  }
}
