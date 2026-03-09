import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

ffmpeg.setFfmpegPath("ffmpeg");

// Format seconds → SRT timestamp
function formatTime(seconds: number) {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
}

export async function POST(req: NextRequest) {
  try {
    const { scenes } = await req.json();

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json(
        { success: false, error: "Invalid scenes data" },
        { status: 400 }
      );
    }

    const backgroundPath = path.join(
      process.cwd(),
      "public",
      "backgrounds",
      "minecraft.mp4"
    );

    const audioPath = path.join(
      process.cwd(),
      "public",
      "uploads",
      "voiceover.mp3"
    );

    const outputDir = path.join(process.cwd(), "public", "renders");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `reel-${timestamp}.mp4`);
    const subtitlePath = path.join(outputDir, `subs-${timestamp}.srt`);

    // 🧠 Get actual audio duration
    const audioDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });

    if (!audioDuration) {
      throw new Error("Could not determine audio duration");
    }

    // Evenly divide audio across scenes
    const sceneDuration = audioDuration / scenes.length;

    // Generate SRT content
    let currentTime = 0;
    let srtContent = "";

    scenes.forEach((scene: any, index: number) => {
      const start = currentTime;
      const end = currentTime + sceneDuration;

      srtContent += `${index + 1}\n`;
      srtContent += `${formatTime(start)} --> ${formatTime(end)}\n`;
      srtContent += `${scene.caption}\n\n`;

      currentTime += sceneDuration;
    });

    fs.writeFileSync(subtitlePath, srtContent);

    // 🔥 Change working directory to avoid Windows drive-letter bug
    process.chdir(outputDir);

    const subtitleFileName = path.basename(subtitlePath);

    await new Promise((resolve, reject) => {
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
        .on("start", (cmd) => {
          console.log("FFmpeg command:", cmd);
        })
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    return NextResponse.json({
      success: true,
      videoUrl: `/renders/${path.basename(outputPath)}`,
    });
  } catch (error) {
    console.error("Render error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
