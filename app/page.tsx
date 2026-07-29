import { Shell } from "@/components/site/shell";
import { Hero } from "@/components/site/hero";
import { ProtocolMarquee } from "@/components/site/protocol-marquee";
import { WalletConnect } from "@/components/site/wallet-connect";

export default function Home() {
  return (
    <Shell>
      <Hero />
      <ProtocolMarquee />
      <WalletConnect />
    </Shell>
  );
}
