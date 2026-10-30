import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owntime - Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function GestaoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
