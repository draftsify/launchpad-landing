import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/chain";
import { WalletProvider } from "@/components/site/wallet-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  /**
   * L'origine sur laquelle Next rend absolues les URL d'images d'aperçu.
   *
   * Sans elle, il se rabat sur `VERCEL_URL`, c'est-à-dire l'URL propre au
   * déploiement — celle qui change à chaque publication et que la protection
   * de déploiement peut fermer. Un robot d'aperçu recevait alors un 401 sur
   * l'image, et le lien s'affichait sans elle sans que rien ne le signale.
   */
  metadataBase: new URL(siteUrl()),
  title: "Reveal — Price Discovery Protocol",
  description:
    "The launchpad optimized for price discovery. More efficient, fairer and more sustainable markets, with rules known upfront and a reasonable exit always open.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Au-dessus du routeur : l'état de connexion doit survivre aux
            navigations et rester lisible par le header comme par les pages. */}
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
