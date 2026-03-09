import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "No text provided" },
        { status: 400 }
      );
    }

    // Dev shortcut: allow testing without spending a Gemini call.
    // Set MOCK_REEL=1 in .env.local to use this hard-coded script.
    if (process.env.MOCK_REEL === "1") {
      const reelScript = {
        title: "This PDF in 30 seconds",
        totalDuration: 30,
        scenes: [
          {
            sceneNumber: 1,
            narration:
              "Wait, before you scroll, this might actually save you time.",
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
      return NextResponse.json({ success: true, reelScript });
    }

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
${text}
`;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing GEMINI_API_KEY" },
        { status: 500 }
      );
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No content returned from Gemini");
    }

    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;

    const cleaned = content.slice(jsonStart, jsonEnd);
    const reelScript = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      reelScript,
    });
  } catch (error) {
    console.error("Gemini REST error:", error);

    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
