const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["10.66.66.2"],
  assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
};

export default nextConfig;
