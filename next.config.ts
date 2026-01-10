import type { NextConfig } from "next";

const repo = process.env.GITHUB_REPOSITORY?.split("/")?.[1] ?? "";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true" && repo.length > 0;

const nextConfig: NextConfig = {
  reactCompiler: true,
  // GitHub Pages requires a fully static output (no Next.js server).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },

  // When deploying to GitHub Pages, the site is served from /<repo>/.
  basePath: isGitHubPages ? `/${repo}` : undefined,
  assetPrefix: isGitHubPages ? `/${repo}/` : undefined,
};

export default nextConfig;
