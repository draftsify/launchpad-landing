import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { FullWidthDivider } from "@/components/full-width-divider";

export const metadata: Metadata = {
  title: "Terms & Policy — Reveal",
  description:
    "The terms that apply when you launch or trade a token on Reveal, and how the protocol handles your data.",
};

const SECTIONS = [
  {
    id: "protocol",
    title: "1. What Reveal is",
    body: [
      "Reveal is a set of smart contracts that apply the same selling rules to every token launched through it. The rules are fixed by the protocol, not by you. It does not custody funds, does not execute trades on your behalf, and does not decide who may sell.",
      "Every rule that applies to a token — unlock duration, initial sellable share, drawdown thresholds, impact caps, anti-sniper settings — is fixed at creation and readable on chain before the first buy.",
    ],
  },
  {
    id: "no-advice",
    title: "2. No financial advice",
    body: [
      "Nothing on this site is investment, legal or tax advice. Tokens launched through Reveal can lose all value. Progressive unlocking reduces the speed at which a position can be sold; it does not protect against loss and does not guarantee any price.",
      "You are responsible for assessing any token you buy, including its team, supply distribution and liquidity.",
    ],
  },
  {
    id: "rules",
    title: "3. Selling rules",
    body: [
      "Selling is limited, not prevented. At any moment the contract computes a maximum sellable amount from elapsed time, position size relative to liquidity, and the position's drawdown. A transaction exceeding that amount is rejected; the remainder stays available later.",
      "Impact caps limit how much a single wallet can move a pool within a time window. These caps apply to unlocked positions as well.",
    ],
  },
  {
    id: "creators",
    title: "4. If you launch a token",
    body: [
      "You are solely responsible for the token you launch, for its representations, and for compliance in your jurisdiction. The selling rules are the protocol's and identical for everyone; nothing else about your launch is reviewed, endorsed or vetted.",
      "Parameters cannot be changed after deployment. Choose them knowing they bind you as much as they bind buyers.",
    ],
  },
  {
    id: "risk",
    title: "5. Technical risk",
    body: [
      "Smart contracts can contain defects. Audits reduce risk but never remove it. Network congestion, RPC failures or chain reorganisations may delay or prevent a transaction.",
      "The protocol is provided as is, without warranty of any kind, to the fullest extent permitted by law.",
    ],
  },
  {
    id: "privacy",
    title: "6. Data and privacy",
    body: [
      "Connecting a wallet exposes your public address to this site. We use it to read on-chain positions. We never request your seed phrase or private keys, and no standard would let us.",
      "Public blockchain activity is, by design, permanent and visible to anyone. Anything you do on chain cannot be deleted on request.",
    ],
  },
  {
    id: "changes",
    title: "7. Changes",
    body: [
      "These terms may change as the protocol evolves. Rules already written into a deployed token are unaffected: they remain whatever was set at its creation.",
    ],
  },
];

export default function TermsPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-16 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr]">
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="space-y-2">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Terms &amp; Policy
              </h1>
              <p className="text-sm text-muted-foreground">
                Last updated 29 July 2026
              </p>
            </div>

            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="space-y-1.5 border-l pl-4">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="max-w-2xl space-y-10">
            <p className="text-sm text-muted-foreground sm:text-base">
              Plain wording, on purpose. If something here is unclear, treat the
              on-chain parameters of a given token as the authority — they are
              what actually executes.
            </p>

            {SECTIONS.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 space-y-3"
              >
                <h2 className="font-medium">{section.title}</h2>
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            <p className="border-t pt-6 text-xs text-muted-foreground">
              This document is a plain-language summary written for a product in
              development. It has not been reviewed by counsel and is not a
              substitute for terms drafted for your jurisdiction.
            </p>
          </div>
        </div>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
