import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { scenes } = await req.json();

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json(
        { success: false, error: "Invalid scenes data" },
        { status: 400 }
      );
    }

    // Combine narration text
    const combinedText = scenes.map((scene: any) => scene.narration).join(" ");

    const voiceId = "JBFqnCBsd6RMkjVDRZzb"; // Working ElevenLabs voice

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
          "xi-api-key": process.env.ELEVEN_API_KEY!,
        },
      }
    );

    // Save inside public/uploads so browser can access it
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, "voiceover.mp3");

    fs.writeFileSync(filePath, Buffer.from(response.data));

    return NextResponse.json({
      success: true,
      audioUrl: "/uploads/voiceover.mp3",
    });
  } catch (error: any) {
    console.error("ElevenLabs TTS error:", error.response?.data || error);

    return NextResponse.json(
      {
        success: false,
        error: error.response?.data || String(error),
      },
      { status: 500 }
    );
  }
}
