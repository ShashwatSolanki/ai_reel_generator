import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["fluent-ffmpeg", "ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
