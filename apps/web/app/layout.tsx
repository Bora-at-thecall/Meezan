import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meezan",
  description: "Calm, automated portfolio management. Set it once. Stay in control.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased min-h-screen`}>
        <Providers>
          <main className="max-w-md mx-auto px-6 py-12">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
