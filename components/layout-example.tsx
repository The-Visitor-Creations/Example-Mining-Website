/**
 * ─────────────────────────────────────────────────────────────────
 * app/layout.tsx — INTEGRATION EXAMPLE
 * ─────────────────────────────────────────────────────────────────
 * Drop LoadInOverlay as a sibling of {children} inside the <body>.
 * It uses fixed positioning so it won't cause layout shift.
 *
 * NOTE: This file is a reference example — copy the relevant parts
 * into your own app/layout.tsx.
 * ─────────────────────────────────────────────────────────────────
 */

import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import LoadInOverlay from '@/components/LoadInOverlay';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Boet Materials Corp.',
  description:
    'A next-generation critical minerals company built for the energy transition.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrains.variable}`}>
      <body className="bg-[#0c0a09] text-[#f2ede8] antialiased">
        {/* ── Load-in overlay with stock price ticker ── */}
        <LoadInOverlay
          companyName="Boet Materials"
          ticker="TSXV: AUM"
          stockPrice="$3.42"
          dayChangeAbs="+$0.18"
          dayChangePct="+5.56%"
          accentColor="#9E1B32"
          backgroundColor="#f5f2ee"
          // forceReplay  ← uncomment to replay every page load (dev only)
        />

        {/* ── Page content loads behind the overlay ── */}
        {children}
      </body>
    </html>
  );
}
