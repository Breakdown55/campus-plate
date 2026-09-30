import type { Metadata } from "next";
import "./style.css";
import "./club.css";
import "./admin.css";
import "./transitions.css";

export const metadata: Metadata = {
  title: "Campus Plate",
  description: "A private campus food calendar for Cal Poly clubs and students.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
