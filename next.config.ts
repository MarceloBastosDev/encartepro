import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Impede o webpack de tentar resolver módulos Node.js no client bundle
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
