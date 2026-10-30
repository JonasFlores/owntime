import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OWNTIME",
    short_name: "OWNTIME",
    description: "Agendamento online simples e seguro.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#000018",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
