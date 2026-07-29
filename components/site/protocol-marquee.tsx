import Image from "next/image";

import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { LOGO_RATIOS } from "@/lib/logo-ratios";

const LOGO_HEIGHT = 20;

const PROTOCOLS = [
  { name: "Uniswap", slug: "uniswap" },
  { name: "Phantom", slug: "phantom" },
  { name: "Ethereum", slug: "ethereum" },
  { name: "Solflare", slug: "solflare" },
] satisfies ReadonlyArray<{ name: string; slug: keyof typeof LOGO_RATIOS }>;

/**
 * Quatre marques ne remplissent pas la bande : on répète la liste. Le nombre
 * de copies doit rester pair, la boucle CSS translatant de -50% (soit ici
 * deux listes entières, donc sans raccord visible).
 */
const COPIES = 4;

function ProtocolItem({ name, slug }: (typeof PROTOCOLS)[number]) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
      <Image
        src={`/logos/${slug}.svg`}
        alt=""
        width={Math.round(LOGO_HEIGHT * LOGO_RATIOS[slug])}
        height={LOGO_HEIGHT}
        unoptimized
        className="h-5 w-auto select-none"
      />
      <span className="text-base font-medium tracking-tight">{name}</span>
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
              {Array.from({ length: COPIES }).flatMap((_, copy) =>
                PROTOCOLS.map((protocol) => (
                  <li
                    key={`${protocol.slug}-${copy}`}
                    // Une seule copie est lue : les autres ne sont là que pour
                    // remplir la bande.
                    aria-hidden={copy > 0}
                  >
                    <ProtocolItem {...protocol} />
                  </li>
                ))
              )}
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
