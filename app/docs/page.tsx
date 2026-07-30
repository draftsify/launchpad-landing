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
                How the protocol behaves, and why each rule is set where it is.
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
                any single position can move the pool within a window.
              </Prose>
              <Prose>
                None of them is a setting. The creator picks a name, a symbol
                and an image; the rules, the supply and the tick range live in
                the launcher, identical for every launch. Letting each creator
                choose how much they are constrained is not a constraint, and it
                makes two tokens incomparable.
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
              <Code>{`// Three strings. That is the whole surface.
//
// Supply, rules and the tick range are not arguments -- they live in the
// launcher, identical for every launch, with no function to change them.
// Nobody funds the pool either: the supply is placed one-sided, so the
// buyers' ETH becomes the liquidity. The creator pays gas and nothing else.
function launch(
    string calldata name,
    string calldata symbol,
    string calldata metadataURI   // image, description, links
) external returns (address token, address pool);`}</Code>
              <Prose>
                One transaction deploys the token, creates its pool, seeds it,
                and arms the rules. There is never a moment where the token
                exists without its pool — so no window in which someone opens a
                competing pool or buys before the gates are live.
              </Prose>
              <Prose>
                <Inline>metadataURI</Inline> is written once and has no setter.
                This interface writes the whole thing as a{" "}
                <Inline>data:</Inline> URI, image included, so a token displays
                from chain state alone — no IPFS pin, no server, nothing to keep
                paying for.
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
                      "Once every position has passed unlockSeconds, only the impact cap remains active.",
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
              <Code>{`releasable(holder) =
    basisAmount
  * max( timeUnlockedBps(now - entryTime),
         reliefBps(drawdownTicks(holder)) )
  / 10_000
  - releasedTotal

sellableNow(holder) = min( releasable(holder), windowRemaining(holder) )`}</Code>
              <Prose>
                Relief is a floor, not an addition. A position deep in drawdown
                never unlocks <em>less</em> than its schedule already permits,
                and a position in profit is never penalised for it.
              </Prose>
              <Callout title="Rejections are partial by nature" tone="warning">
                A sell above the limit reverts with{" "}
                <Inline>PositionLocked</Inline> or{" "}
                <Inline>ImpactCapExceeded</Inline>, each returning the amount
                that would have succeeded. Uniswap swallows both — read{" "}
                <Inline>sellableNow</Inline> first and offer that amount.
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
                    term: "The pool",
                    description:
                      "One address, written at launch and never changed. Tokens leaving toward it are a sell: both the unlock budget and the impact window apply.",
                  },
                  {
                    term: "Wallet to wallet",
                    description:
                      "Consumes the unlock budget exactly as a sale would, so splitting a position across ten addresses does not reset its schedule. The impact cap does not apply — no price moved.",
                  },
                  {
                    term: "Nothing is blocked outright",
                    description:
                      "There is no whitelist, no blocked destination, no pause and no admin. A transfer either fits inside what the position may release, or it reverts — and the receiving address opens a position of its own.",
                  },
                  {
                    term: "Protocol fees",
                    description:
                      "Fees moving from the pool to the treasury are not counted as a buy, since no quote enters — counting them would inflate the impact cap's reference. They do open a position, so the protocol is bound by its own selling rules.",
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
(int24 reference, bool fresh) = twapTick();  // !fresh -> no relief at all
uint256 drop   = ticksBelow(basisTick, reference);
uint256 relief = drop * 10_000 / 6_932;      // 6932 ticks = a halving`}</Code>
              <Prose>
                Entry price is the opposite: recorded at spot, not TWAP. The
                average lags by minutes, so during a fast climb a buyer would be
                credited a price far below what they actually paid, would look
                permanently in profit, and would never receive the relief their
                real loss entitles them to.
              </Prose>
              <Prose>
                Spot is safe in that direction. Inflating it to manufacture
                future relief means buying at the inflated price yourself — the
                loss is then real, and the relief earned.
              </Prose>
              <Prose>
                A longer window costs responsiveness during a genuine crash; a
                shorter one lowers the cost of manipulating relief. Five minutes
                is a constant in the token, not a parameter, and is expected to
                be revisited before audit.
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
              lede="A floor that rises continuously as a position goes under water."
            >
              <ParamTable params={RELIEF_PARAMS} />
              <Callout title="No tiers, and no trap at the bottom">
                Relief is a straight ratio of the drop, not a set of steps: down
                10% releases roughly 15%, and a halved price releases
                everything. A holder deep in loss who still cannot exit would
                call this a trap, and they would be right — so that case is the
                one the curve is built around.
              </Callout>
            </DocSection>

            <DocSection
              id="impact"
              title="Impact caps"
              lede="A ceiling on how much one position can move the pool at once."
            >
              <ParamTable params={IMPACT_PARAMS} />
              <Prose>
                The cap applies to fully unlocked positions too. It is measured
                on a rolling window, so a refused remainder becomes available
                again as the window slides rather than at a fixed reset.
              </Prose>
              <Callout title="Nothing sells before something buys">
                The cap is a share of the pool&apos;s quote reserve, and that
                reserve starts at zero. Until someone buys, the cap is zero and
                no sell can pass. This falls out of one-sided liquidity rather
                than being a rule of its own.
              </Callout>
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
    // What a sell would execute right now: the binding one of the two.
    function sellableNow(address holder) external view returns (uint256);

    // The two limits, separately, when you need to explain which one bit.
    function releasable(address holder) external view returns (uint256);
    function windowRemaining(address holder) external view returns (uint256);

    // How open the position is, and how far under water.
    function unlockedBps(address holder) external view returns (uint256);
    function drawdownTicks(address holder) external view returns (uint256);
    function twapTick() external view returns (int24 tick, bool fresh);

    function rules() external view returns (Rules memory);
    function metadataURI() external view returns (string memory);
}`}</Code>
              <Prose>
                <Inline>sellableNow</Inline> is the call a front end must make
                before enabling a sell button — and it is not optional. Uniswap
                wraps token transfers in its own <Inline>_safeTransfer</Inline>,
                so a rejected sell surfaces as the pool&apos;s{" "}
                <Inline>TF</Inline>, never as our custom error. Reading the
                failure afterwards tells the user nothing; reading the view
                beforehand tells them the exact amount that works.
              </Prose>
              <Prose>
                <Inline>fresh</Inline> is false while the pool has no oracle
                history to average. Relief returns zero in that state rather
                than falling back to spot, because spot relief would pay anyone
                who crashes the price for a single block.
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
              lede="Nothing at launch, and the pool's own fee tier on trades."
            >
              <DefList
                items={[
                  {
                    term: "Launch cost",
                    description:
                      "Gas only. Nobody advances capital — not the creator, not the protocol. The whole supply is placed on one side of a tick range, so the pool starts with zero quote and the buyers' ETH becomes the liquidity.",
                  },
                  {
                    term: "Liquidity",
                    description:
                      "The position belongs to RevealFees, which exposes nothing but burn(lower, upper, 0). Zero is hardcoded, not a parameter: it materialises accrued fees without withdrawing any liquidity. Locked as firmly as a dead address, minus the stranded fees.",
                  },
                  {
                    term: "Trade fee",
                    description:
                      "The Uniswap V3 fee tier of the pool, accruing to that locked position. collect(token) is permissionless and sends only to the treasury written at deployment — anyone can trigger it, nobody can redirect it, and the contract never holds funds between calls.",
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
                <Inline>Entry</Inline> and <Inline>Exit</Inline>, then recompute
                sellable amounts rather than storing them — they change with
                every block through elapsed time and price.
              </Prose>
              <Code>{`// derived, never stored -- or just ask the contract
const sellable = await token.read.sellableNow([holder]);`}</Code>
              <Prose>
                An indexer is not required to display a token: name, symbol and{" "}
                <Inline>metadataURI</Inline> are all readable from a plain RPC
                node. It is required for anything historical — yesterday&apos;s
                price, a holder count, a volume chart. A node answers the
                present only.
              </Prose>
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
                      "Buying through many wallets sidesteps per-position sizing and per-position windows. The aim is to make that costly and visible, not impossible — any real fix would require identity, which this protocol will not do.",
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
                      "Nothing can be fixed after deployment, and since the rules are shared, a badly chosen value applies to every launch rather than one. Correcting it means deploying a new launcher; the tokens already out keep the old rules forever.",
                  },
                  {
                    term: "Errors do not survive the pool",
                    description:
                      "Uniswap wraps transfers, so a refused sell reaches the user as TF, not as PositionLocked. Any interface that skips the sellableNow view will show its users a failure it cannot explain.",
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
