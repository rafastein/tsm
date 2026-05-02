import type { NextConfig } from "next";
import path from "path";

const projectNodeModules = path.resolve(__dirname, "node_modules");

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      tailwindcss: path.join(projectNodeModules, "tailwindcss"),
    },
  },
  webpack: (config) => {
    config.resolve.modules = [
      projectNodeModules,
      ...(config.resolve.modules ?? ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;
