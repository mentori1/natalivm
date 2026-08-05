import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "project-lnmw3.vercel.app",
          },
        ],
        destination:
          "https://vumexclusive.45-12-238-157.sslip.io/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
