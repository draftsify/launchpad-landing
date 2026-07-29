import Image from "next/image";

import { ProgressiveBlur } from "@/components/ui/progressive-blur";

type Protocol = {
  name: string;
  src: string;
  /** L'icône Uniswap n'est pas carrée, contrairement aux glyphes Simple Icons. */
  ratio?: number;
};

const PROTOCOLS: Protocol[] = [
  { name: "Uniswap", src: "/logos/uniswap.svg", ratio: 400 / 434 },
  { name: "Ethereum", src: "/logos/ethereum.svg" },
  { name: "Chainlink", src: "/logos/chainlink.svg" },
  { name: "Optimism", src: "/logos/optimism.svg" },
  { name: "Polygon", src: "/logos/polygon.svg" },
  { name: "WalletConnect", src: "/logos/walletconnect.svg" },
];

function ProtocolItem({ protocol }: { protocol: Protocol }) {
  const ratio = protocol.ratio ?? 1;

  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
      <Image
        src={protocol.src}
        alt=""
        width={Math.round(20 * ratio)}
        height={20}
        unoptimized
        className="h-5 w-auto select-none"
      />
      <span className="text-base font-medium tracking-tight">
        {protocol.name}
      </span>
    </div>
  );
}

export function ProtocolMarquee() {
  return (
    <section className="pt-5 pb-10">
      <h2 className="mb-4 text-center text-lg font-medium tracking-tight text-muted-foreground md:text-xl">
        Powered by <span className="text-foreground">open protocols</span>
      </h2>

      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-px left-1/2 h-px w-screen -translate-x-1/2 bg-border"
        />

        <div className="relative border-x border-y bg-linear-to-r from-secondary via-transparent to-secondary py-6">
          <div className="overflow-hidden">
            <ul
              className="animate-marquee flex w-max"
              style={
                {
                  gap: "42px",
                  "--marquee-gap": "42px",
                  "--marquee-duration": "60s",
                } as React.CSSProperties
              }
            >
              {/* Dupliqué une fois : la boucle CSS translate de -50%, la
                  seconde copie prend le relais sans saut visible. La copie est
                  masquée aux lecteurs d'écran pour ne pas lire deux fois. */}
              {[...PROTOCOLS, ...PROTOCOLS].map((protocol, i) => (
                <li
                  key={`${protocol.name}-${i}`}
                  aria-hidden={i >= PROTOCOLS.length}
                >
                  <ProtocolItem protocol={protocol} />
                </li>
              ))}
            </ul>
          </div>

          <ProgressiveBlur
            direction="left"
            className="absolute top-0 left-0 h-full w-[100px] md:w-[160px]"
          />
          <ProgressiveBlur
            direction="right"
            className="absolute top-0 right-0 h-full w-[100px] md:w-[160px]"
          />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-1/2 h-px w-screen -translate-x-1/2 bg-border"
        />
      </div>
    </section>
  );
}
