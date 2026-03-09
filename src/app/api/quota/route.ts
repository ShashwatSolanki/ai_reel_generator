import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

const MAX_PER_DAY =
  Number(process.env.REELS_PER_DAY_LIMIT || "") > 0
    ? Number(process.env.REELS_PER_DAY_LIMIT)
    : 20;

type QuotaState = {
  date: string;
  count: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function readQuotaFile() {
  const cacheDir = path.join(process.cwd(), "uploads", "cache");
  const quotaPath = path.join(cacheDir, "quota.json");

  if (!fs.existsSync(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }

  if (!fs.existsSync(quotaPath)) {
    const initial: QuotaState = { date: today(), count: 0 };
    await writeFile(quotaPath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = await readFile(quotaPath, "utf8");
  let parsed: QuotaState;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { date: today(), count: 0 };
  }

  if (parsed.date !== today()) {
    parsed = { date: today(), count: 0 };
    await writeFile(quotaPath, JSON.stringify(parsed, null, 2), "utf8");
  }

  return parsed;
}

export async function GET() {
  try {
    const quota = await readQuotaFile();
    const remaining = Math.max(0, MAX_PER_DAY - quota.count);

    return NextResponse.json({
      success: true,
      maxPerDay: MAX_PER_DAY,
      used: quota.count,
      remaining,
    });
  } catch (error: any) {
    console.error("quota GET error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

