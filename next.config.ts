import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the workspace root to this project.
   *
   * Next infers the root from the nearest lockfile, and it kept guessing
   * wrong -- first `~` (an orphan package-lock.json with no package.json
   * beside it), then `~/Desktop`. A watcher pointed at a whole home folder
   * is how a dev server stops noticing edits: one ran for eight days serving
   * a stale globals.css while the file on disk had long since changed.
   *
   * Resolution follows the same root, so a wrong guess also means PostCSS
   * cannot find `tailwindcss`. Stated outright, nothing is inferred.
   */
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
