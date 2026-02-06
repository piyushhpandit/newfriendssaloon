import type { NextConfig } from "next";

function normalizeBasePath(p: string | undefined | null): string {
  const v = (p ?? "").trim();
  if (!v || v === "/") return "";
  return v.startsWith("/") ? v.replace(/\/$/, "") : `/${v.replace(/\/$/, "")}`;
}

const repo = process.env.GITHUB_REPOSITORY?.split("/")?.[1] ?? "";
const isVercel = Boolean(process.env.VERCEL);
// Prefer explicit env override (useful for local builds), else infer from GitHub repo name.
const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? (repo ? `/${repo}` : ""));

const nextConfig: NextConfig = {
  reactCompiler: true,
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isVercel
    ? {}
    : {
        // GitHub Pages requires a fully static output (no Next.js server).
        output: "export",
        // When deploying to GitHub Pages, the site is served from /<repo>/.
        basePath: basePath || undefined,
        assetPrefix: basePath ? `${basePath}/` : undefined,
      }),
};

export default nextConfig;
