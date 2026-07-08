import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 固定 Turbopack 專案根目錄，避免因為上層有多個 lockfile 而選錯根目錄（導致路由 404）
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
