import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Allow dev asset requests through ngrok tunnels (URL changes between sessions)
  allowedDevOrigins: ["**.ngrok-free.dev"],
};

export default config;
