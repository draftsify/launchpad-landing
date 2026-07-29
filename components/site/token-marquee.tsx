import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { cn } from "@/lib/utils";

type Token = {
  name: string;
  ticker: string;
  marketCap: string;
  change: number;
};

// Données mock — aucun backend branché à ce stade.
const TOKENS: Token[] = [
  { name: "Halcyon", ticker: "HLCN", marketCap: "$1.24M", change: 42.8 },
  { name: "Northwind", ticker: "NRTH", marketCap: "$860K", change: 12.4 },
  { name: "Basalt", ticker: "BSLT", marketCap: "$2.07M", change: -6.2 },
  { name: "Meridian", ticker: "MRDN", marketCap: "$418K", change: 88.1 },
  { name: "Tidewater", ticker: "TIDE", marketCap: "$1.71M", change: -2.9 },
  { name: "Ashford", ticker: "ASHF", marketCap: "$935K", change: 5.7 },
  { name: "Perihelion", ticker: "PRHL", marketCap: "$3.02M", change: -11.4 },
  { name: "Longwave", ticker: "LNGW", marketCap: "$612K", change: 23.6 },
];

function TokenPill({ token }: { token: Token }) {
  const positive = token.change >= 0;

  return (
    <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
      <span className="text-sm font-medium">{token.name}</span>
      <span className="font-mono text-xs text-muted-foreground">
        ${token.ticker}
      </span>
      <span aria-hidden className="block h-3.5 border-l" />
      <span className="font-mono text-xs text-muted-foreground">
        {token.marketCap}
      </span>
      {/* En monochrome, la direction passe par la flèche, pas par la couleur. */}
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          positive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span aria-hidden>{positive ? "↑" : "↓"}</span>
        {Math.abs(token.change).toFixed(1)}%
        <span className="sr-only">
          {positive ? "up" : "down"} over 24 hours
        </span>
      </span>
    </div>
  );
}

export function TokenMarquee() {
  return (
    <section className="pt-5 pb-10">
      <h2 className="mb-4 text-center text-lg font-medium tracking-tight text-muted-foreground md:text-xl">
        Live <span className="text-foreground">launches</span>
      </h2>

      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-px left-1/2 h-px w-screen -translate-x-1/2 bg-border"
        />

        <div className="relative border-x border-y bg-linear-to-r from-secondary via-transparent to-secondary py-6">
          <div className="overflow-hidden">
            <div
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
                  seconde copie prend le relais sans saut visible. */}
              {[...TOKENS, ...TOKENS].map((token, i) => (
                <TokenPill key={`${token.ticker}-${i}`} token={token} />
              ))}
            </div>
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
