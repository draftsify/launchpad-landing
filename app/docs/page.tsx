import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { DocsNav } from "@/components/site/docs-nav";
import {
  Callout,
  Code,
  DefList,
  DocSection,
  Inline,
  ParamTable,
  Prose,
} from "@/components/site/docs-parts";
import {
  ERRORS,
  EVENTS,
  IMPACT_PARAMS,
  RELIEF_PARAMS,
  SNIPER_PARAMS,
  UNLOCK_PARAMS,
} from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs — Reveal",
  description:
    "Reference for Reveal: concepts, launch parameters, contract interface, events, errors and operational limits.",
};

export default function DocsPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-20 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,236px)_1fr] lg:gap-12">
          {/* overscroll-contain : arriver en bas de la sidebar ne doit pas
              entraîner la page derrière elle. */}
          <aside className="scrollbar-slim overscroll-contain lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-2 lg:pb-8">
            <div className="mb-6 space-y-2">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                <BlurWords text="Docs" delay={0.05} />
              </h1>
              <p className="text-sm text-muted-foreground">
                How the protocol behaves, and every knob you can turn.
              </p>
            </div>
            <DocsNav />
          </aside>

          <div className="max-w-2xl space-y-14">
            {/* ------------------------ Getting started ------------------ */}

            <DocSection
              id="overview"
              title="Overview"
              lede="Reveal is a set of contracts that apply the same selling rules to every token launched through it."
            >
              <Prose>
                The protocol does not custody funds, does not execute trades on
                your behalf, and does not decide who may sell. It computes, per
                position, how much may be released right now — and rejects
                anything above that.
              </Prose>
              <Prose>
                Three rules do the work: a time-based unlock, relief that
                accelerates when a position is underwater, and a cap on how much
                any single wallet can move the pool within a window. Everything
                else is configuration.
              </Prose>
              <Callout title="What this is not">
                Reveal reduces the damage a handful of wallets can do to a fresh
                market. It does not make a launch safe, does not vet teams, and
                cannot stop a token from going to zero.
              </Callout>
            </DocSection>

            <DocSection
              id="quickstart"
              title="Quickstart"
              lede="A launch is a single transaction against the factory."
            >
              <Code>{`import { createToken } from "@reveal/sdk";

// Supply and liquidity are not yours to set. Supply is fixed by the
// launcher, and the pool is seeded one-sided with it -- buyers' ETH
// becomes the liquidity. You pay gas.
const token = await createToken({
  name: "Reveal",
  symbol: "REVEAL",
  metadataURI: "ipfs://...",  // image, description, links

  rules: {
    initialUnlock: 1000,      // 10% sellable from block one
    unlockDuration: 86_400,   // fully unlocked after 24h
    impactCap: 1000,          // 10% of the quote reserve...
    impactWindow: 300,        // ...per 5 minute window
    launchDelay: 30,          // no buys for the first 30s
    buyRamp: 600,             // buy size opens up over 10 minutes
  },
});`}</Code>
              <Prose>
                Every field in <Inline>rules</Inline> is optional and falls back
                to the defaults listed under Parameters. Omitting a field is a
                choice like any other — the resulting values are public before
                the first buy either way.
              </Prose>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button asChild size="sm">
                  <Link href="/create">
                    Launch a token
                    <ArrowRight />
                  </Link>
                </Button>
                <Button variant="card" size="sm" asChild>
                  <Link href="/how-it-works">See the mechanics</Link>
                </Button>
              </div>
            </DocSection>

            <DocSection
              id="lifecycle"
              title="Launch lifecycle"
              lede="What happens between deployment and a fully liquid market."
            >
              <DefList
                items={[
                  {
                    term: "1 · Deploy",
                    description:
                      "The factory deploys the token, creates the pool, and writes the rules into immutable storage. Nothing can trade yet.",
                  },
                  {
                    term: "2 · Delay window",
                    description:
                      "For launchDelay seconds, buys revert. This removes the same-block advantage that lets a bot own the first print.",
                  },
                  {
                    term: "3 · Buy ramp",
                    description:
                      "Trading opens with a cap on individual buy size that grows over buyRamp seconds until it disappears.",
                  },
                  {
                    term: "4 · Discovery",
                    description:
                      "Buys become positions. Sells are metered per position and per wallet window, so pressure arrives spread out rather than at once.",
                  },
                  {
                    term: "5 · Steady state",
                    description:
                      "Once every position has passed unlockDuration, only the impact cap remains active.",
                  },
                ]}
              />
            </DocSection>

            {/* ------------------------- Core concepts ------------------- */}

            <DocSection
              id="positions"
              title="Positions, not balances"
              lede="The unit of accounting is the buy, not the wallet."
            >
              <Prose>
                A wallet holds one position, and every buy folds into it:
                entry time and entry price are re-weighted by amount. Topping
                up therefore makes a position younger, which is exactly what
                the rule should do.
              </Prose>
              <Code>{`struct Position {
    uint64  entryTime;      // weighted average, moves down on every buy
    int24   basisTick;      // spot tick at entry, not TWAP
    uint128 basisAmount;    // everything the position ever received
    uint128 releasedTotal;  // what it has already let out
    uint128 soldInWindow;   // leaky bucket for the impact cap
    uint64  soldAt;
}`}</Code>
              <Prose>
                The unlock budget is measured against everything the position
                ever received, minus what it has already released — never
                against the current balance. Against the balance, selling 10%
                would immediately reopen 10% of the remainder.
              </Prose>
            </DocSection>

            <DocSection
              id="sellable"
              title="Computing the sellable amount"
              lede="Three inputs, then a cap."
            >
              <Code>{`releasable(position) =
    basisAmount
  * max( timeUnlock(elapsed, duration),
         reliefUnlock(ticksBelowEntry) )
  - releasedTotal

executable = min( releasable, remainingWindowAllowance(wallet) )`}</Code>
              <Prose>
                Relief is a floor, not an addition. A position deep in drawdown
                never unlocks <em>less</em> than its schedule already permits,
                and a position in profit is never penalised for it.
              </Prose>
              <Callout title="Rejections are partial by nature" tone="warning">
                A sell above the limit reverts with{" "}
                <Inline>ExceedsSellable</Inline> and returns the amount that
                would have succeeded. Interfaces should offer that amount rather
                than showing a bare failure.
              </Callout>
            </DocSection>

            <DocSection
              id="enforcement"
              title="Where the rules live"
              lede="In the token's transfer hook, not only in the router."
            >
              <Prose>
                If limits only existed in the launchpad&apos;s router, moving tokens
                to a second wallet or trading them on another pool would bypass
                everything. The check therefore sits in the token itself.
              </Prose>
              <DefList
                items={[
                  {
                    term: "Whitelisted pools",
                    description:
                      "Pools created by the factory are known to the token. Transfers into them are treated as sells and metered.",
                  },
                  {
                    term: "Wallet to wallet",
                    description:
                      "Transfers to an unknown address consume sellable amount exactly as a sale would, so splitting a position does not reset its schedule.",
                  },
                  {
                    term: "Contracts",
                    description:
                      "Transfers to unrecognised contracts revert with UnknownDestination until the destination is registered.",
                  },
                ]}
              />
            </DocSection>

            <DocSection
              id="oracle"
              title="Price oracle"
              lede="Drawdown is measured against a time-weighted average, never spot."
            >
              <Prose>
                This is the single most important implementation detail in the
                protocol. Reading spot price would let anyone crash the market
                for one block, unlock their entire position under maximum
                relief, and sell into the recovery.
              </Prose>
              <Code>{`// 5 minute TWAP, read from the pool's own tick accumulator.
// Ticks, not prices: 1.0001^n is not worth computing on chain.
int24  reference = twapTick();          // reverts -> no relief at all
uint256 drop     = ticksBelow(basisTick, reference);
uint256 relief   = drop * 10_000 / 6_932;   // 6932 ticks = a halving`}</Code>
              <Prose>
                A longer window costs responsiveness during a genuine crash; a
                shorter one lowers the cost of manipulating relief. Thirty
                minutes is the current default and is expected to move before
                audit.
              </Prose>
            </DocSection>

            {/* --------------------------- Parameters -------------------- */}

            <DocSection
              id="unlock"
              title="Unlock schedule"
              lede="Basis points throughout, so 10000 bps equals 100%."
            >
              <ParamTable params={UNLOCK_PARAMS} />
              <Prose>
                The schedule does not depend on position size — a whale and a
                small buyer unlock on the same curve. What separates them is the
                impact cap, which is measured against the pool rather than
                against the holder. Making the schedule itself size-aware is an
                open design question, not a shipped feature.
              </Prose>
            </DocSection>

            <DocSection
              id="relief"
              title="Drawdown relief"
              lede="Tiers that raise the floor when a position is underwater."
            >
              <ParamTable params={RELIEF_PARAMS} />
              <Callout title="Keep the top tier high">
                A holder who is down 40% and still cannot exit will describe
                your launchpad as a trap, and they will be right. The default
                top tier releases 95%.
              </Callout>
            </DocSection>

            <DocSection
              id="impact"
              title="Impact caps"
              lede="A ceiling on how much one wallet can move the pool at once."
            >
              <ParamTable params={IMPACT_PARAMS} />
              <Prose>
                The cap applies to unlocked positions too. It is measured on a
                rolling window per wallet, so a refused remainder becomes
                available again as the window slides rather than at a fixed
                reset.
              </Prose>
            </DocSection>

            <DocSection
              id="antisniper"
              title="Anti-sniper"
              lede="Rules that only apply to the opening minutes."
            >
              <ParamTable params={SNIPER_PARAMS} />
              <Prose>
                These reduce the advantage of being first; they do not remove
                it. Ordering ultimately belongs to whoever sequences the chain.
              </Prose>
            </DocSection>

            {/* --------------------------- Reference --------------------- */}

            <DocSection
              id="interface"
              title="Interface"
              lede="The surface an integration needs."
            >
              <Code>{`interface IRevealToken {
    function sellableOf(uint256 id) external view returns (uint256);
    function positionsOf(address owner)
        external view returns (uint256[] memory);
    function windowAllowance(address wallet)
        external view returns (uint256 remaining, uint64 resetsAt);
    function rules() external view returns (Rules memory);
}`}</Code>
              <Prose>
                <Inline>sellableOf</Inline> is the call a front end should make
                before enabling a sell button. It already accounts for time,
                size, relief and prior sales — but not for the wallet&apos;s window
                allowance, which <Inline>windowAllowance</Inline> returns
                separately.
              </Prose>
            </DocSection>

            <DocSection
              id="events"
              title="Events"
              lede="What an indexer should listen to."
            >
              <DefList
                items={EVENTS.map((e) => ({
                  term: e.signature,
                  description: e.description,
                }))}
              />
            </DocSection>

            <DocSection
              id="errors"
              title="Errors"
              lede="Custom errors, so a failed trade explains itself."
            >
              <DefList
                items={ERRORS.map((e) => ({
                  term: e.name,
                  description: e.description,
                }))}
              />
            </DocSection>

            <DocSection
              id="fees"
              title="Fees"
              lede="Charged at launch and on trades routed through the protocol."
            >
              <DefList
                items={[
                  {
                    term: "Launch cost",
                    description:
                      "Gas only. The protocol treasury seeds the pool and the LP tokens are burned, so the liquidity is neither the creator's to fund nor anyone's to withdraw.",
                  },
                  {
                    term: "Trade fee",
                    description:
                      "A share of each swap routed through a protocol pool, split between the pool and the treasury.",
                  },
                  {
                    term: "No sell penalty",
                    description:
                      "Selling is never taxed more heavily than buying. Asymmetric taxes push holders toward the exits they can still use, which is the opposite of the intent here.",
                  },
                ]}
              />
            </DocSection>

            {/* -------------------------- Operations --------------------- */}

            <DocSection
              id="indexing"
              title="Indexing"
              lede="Reconstructing state from events."
            >
              <Prose>
                Positions are the unit of state worth indexing. Track{" "}
                <Inline>PositionOpened</Inline> and{" "}
                <Inline>PositionReduced</Inline>, then recompute sellable
                amounts client-side rather than storing them — they change with
                every block through elapsed time and price.
              </Prose>
              <Code>{`// derived, never stored
const sellable = positions
  .map(p => sellableAt(p, now, twap))
  .reduce((a, b) => a + b, 0n);`}</Code>
            </DocSection>

            <DocSection
              id="limits"
              title="Known limits"
              lede="Where the protocol stops helping."
            >
              <DefList
                items={[
                  {
                    term: "Multi-wallet splitting",
                    description:
                      "Buying through many wallets sidesteps per-position sizing and per-wallet windows. The aim is to make that costly and visible, not impossible — any real fix would require identity, which this protocol will not do.",
                  },
                  {
                    term: "MEV",
                    description:
                      "Sandwiching and front-running are reduced by the opening delay and buy ramp, never eliminated. Ordering belongs to the sequencer.",
                  },
                  {
                    term: "Oracle manipulation",
                    description:
                      "A sufficiently capitalised actor can move a 5 minute TWAP. Deeper liquidity raises that cost more than any parameter here — and since buyers are the liquidity, it deepens as a launch succeeds.",
                  },
                  {
                    term: "Immutability cuts both ways",
                    description:
                      "Parameters cannot be fixed after deployment. A misconfigured launch stays misconfigured.",
                  },
                ]}
              />
              <Callout title="Status" tone="warning">
                This documentation describes intended behaviour for a protocol
                still in development. Names, ranges and defaults will move
                before audit, and no contract has been deployed.
              </Callout>
            </DocSection>
          </div>
        </div>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
