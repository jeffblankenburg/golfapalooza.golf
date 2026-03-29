import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.6.184"],
  devIndicators: false,
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
