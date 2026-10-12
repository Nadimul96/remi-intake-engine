import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "REMI operator console intake spine",
  title: "REMI Console"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
