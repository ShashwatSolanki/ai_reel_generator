"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [cachedScript, setCachedScript] = useState<boolean | null>(null);
  const [reelScript, setReelScript] = useState<any | null>(null);
  const [quota, setQuota] = useState<{
    maxPerDay: number;
    used: number;
    remaining: number;
  } | null>(null);

  const demoUrl = "/renders/demo.mp4";

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const res = await fetch("/api/quota");
        const data = await res.json();
        if (!res.ok || !data?.success) return;
        setQuota({
          maxPerDay: data.maxPerDay,
          used: data.used,
          remaining: data.remaining,
        });
      } catch {
        // ignore
      }
    };
    fetchQuota();
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setBusy(true);
    setError(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setCachedScript(null);
    setReelScript(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/generate-reel", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Request failed");
      }

      setVideoUrl(data.videoUrl || null);
      setAudioUrl(data.audioUrl || null);
      setCachedScript(Boolean(data.cachedScript));
      setReelScript(data.reelScript || null);

      if (data.quota) {
        setQuota(data.quota);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, #1f2937 0, #020617 45%, #000 100%)",
        color: "white",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          backgroundColor: "rgba(15,23,42,0.9)",
          borderRadius: 18,
          border: "1px solid rgba(148,163,184,0.3)",
          boxShadow:
            "0 24px 60px rgba(15,23,42,0.9), 0 0 0 1px rgba(15,23,42,0.7)",
          padding: 24,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            AI Reel Generator
          </h1>
          {quota ? (
            <p
              style={{
                fontSize: 12,
                color: "#9ca3af",
                marginBottom: 8,
              }}
            >
              Daily limit:{" "}
              <b>
                {quota.remaining} / {quota.maxPerDay}
              </b>{" "}
              reels left today
            </p>
          ) : null}
          <p
            style={{
              fontSize: 14,
              color: "#9ca3af",
              marginBottom: 20,
            }}
          >
            Drop in a PDF or PPTX and get a vertical Minecraft-parkour-style
            reel with AI narration.
          </p>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px dashed rgba(148,163,184,0.5)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background:
                  "radial-gradient(circle at 30% 30%, #22c55e, #15803d)",
              }}
            />
            <span>{file ? file.name : "Choose PDF or PPTX"}</span>
            <input
              type="file"
              style={{ display: "none" }}
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <button
              onClick={handleUpload}
              disabled={!file || busy}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                fontSize: 14,
                fontWeight: 500,
                cursor: !file || busy ? "not-allowed" : "pointer",
                opacity: !file || busy ? 0.6 : 1,
                background:
                  "linear-gradient(135deg, #22c55e, #16a34a, #22c55e)",
                color: "black",
              }}
            >
              {busy ? "Generating reel…" : "Generate reel"}
            </button>

            {cachedScript !== null ? (
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  backgroundColor: "rgba(15,118,110,0.2)",
                  color: "#6ee7b7",
                  alignSelf: "center",
                }}
              >
                Script cache:{" "}
                <b>{cachedScript ? "HIT (no extra Gemini call)" : "MISS"}</b>
              </span>
            ) : null}
          </div>

          {error ? (
            <p
              style={{
                color: "#fecaca",
                backgroundColor: "rgba(127,29,29,0.35)",
                border: "1px solid rgba(248,113,113,0.4)",
                borderRadius: 12,
                padding: "8px 10px",
                fontSize: 13,
                marginTop: 16,
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </p>
          ) : null}

          {reelScript ? (
            <div
              style={{
                marginTop: 18,
                padding: 10,
                borderRadius: 12,
                backgroundColor: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(148,163,184,0.4)",
                maxHeight: 260,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 12 }}>
                  Generated script (JSON)
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  Scenes: {Array.isArray(reelScript.scenes)
                    ? reelScript.scenes.length
                    : "?"}
                </span>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  whiteSpace: "pre",
                }}
              >
                {JSON.stringify(reelScript, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          <div
            style={{
              width: 260,
              maxWidth: "100%",
              aspectRatio: "9 / 16",
              borderRadius: 20,
              border: "1px solid rgba(148,163,184,0.5)",
              background:
                "radial-gradient(circle at top, #22c55e33 0, #020617 50%, #000 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {videoUrl ? (
              <video
                controls
                src={videoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <video
                controls
                src={demoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )}
          </div>

          {videoUrl ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12,
                color: "#a5b4fc",
                textDecoration: "underline",
              }}
            >
              Open reel in new tab
            </a>
          ) : (
            <a
              href={demoUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12,
                color: "#a5b4fc",
                textDecoration: "underline",
              }}
            >
              Open demo reel in new tab
            </a>
          )}

          {audioUrl ? (
            <div style={{ width: "100%", marginTop: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4, color: "#9ca3af" }}>
                Voiceover preview
              </div>
              <audio controls src={audioUrl} style={{ width: "100%" }} />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
