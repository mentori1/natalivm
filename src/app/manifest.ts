import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VUMEXCLUSIVE · CRM",
    short_name: "VUMEXCLUSIVE",
    description: "Личный кабинет преподавателя VUMEXCLUSIVE",
    start_url: "/",
    display: "standalone",
    background_color: "#F6E6EA",
    theme_color: "#1A0A0F",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
