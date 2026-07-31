import type { Metadata } from "next";
import Link from "next/link";

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
import { LaunchButton } from "@/components/site/launch-button";
import {
  ERRORS,
  EVENTS,
  CREATOR_BUY_PARAMS,
  DEPLOYMENT,
  METADATA_RULES,
  GRADUATION_PARAMS,
  RELIEF_PARAMS,
  SNIPER_PARAMS,
  UNLOCK_PARAMS,
} from "@/lib/docs";
import { GRADUATION_QUOTE_ETH } from "@/lib/presets";

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
                accelerates when a position is underwater, and a ramp on
                how large a single buy may be in the opening minutes.
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
) external returns (address token, address pool);

// The same launch, plus a buy for the creator in the same transaction --
// the first position on the curve, before the anti-sniper delay opens for
// anyone else. Capped at CREATOR_BUY_MAX_BPS of the supply, and locked on
// the ordinary schedule: earlier in, never earlier out.
function launchWithBuy(
    string calldata name,
    string calldata symbol,
    string calldata metadataURI
) external payable returns (address token, address pool);`}</Code>
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
                <LaunchButton size="sm" />
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
                      "For launchDelay seconds, buys revert. This removes the same-block advantage that lets a bot own the first print. One exception, and only one: a creator using launchWithBuy buys inside the launch block itself, capped at 5% of the supply.",
                  },
                  {
                    term: "3 · Buy ramp",
                    description:
                      "Trading opens with a cap on individual buy size that grows over buyRamp seconds until it disappears.",
                  },
                  {
                    term: "4 · Discovery",
                    description:
                      "Buys become positions. Every outgoing transfer -- to the pool or to another wallet -- is metered against that position, so pressure arrives spread out rather than at once.",
                  },
                  {
                    term: "5 · Steady state",
                    description:
                      "Once a position has passed unlockSeconds it is an ordinary ERC-20 balance. No cap, no window, no residual restriction.",
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
                A wallet carries one locked tranche. A buy folds into it: what
                is <em>still</em> locked from before is added to the locked
                share of the new buy, and the clock restarts on the sum. Topping
                up therefore makes the locked remainder younger, which is what
                the rule should do — while everything already free stays free.
              </Prose>
              <Code>{`struct Position {
    uint64  lockStart;    // reset by every buy
    int24   lockTick;     // entry price of what is still locked
    uint128 lockedBasis;  // size whose (10_000 - unlockedBps) share is locked
}`}</Code>
              <Prose>
                Note what is <em>not</em> stored: any record of what the
                position has already released. An earlier version kept a
                running <Inline>releasedTotal</Inline> and compared it to a
                recomputed budget — and that debt outlived the position. Exit
                almost entirely, leave a wei of dust, buy again, and the old
                debt was set against the new purchase: the buy started with
                nothing releasable, though the protocol promises{" "}
                {`${10}`}% immediately.
              </Prose>
              <Prose>
                The free amount is now a subtraction rather than a ledger, so
                there is no debt to outlive anything.
              </Prose>
            </DocSection>

            <DocSection
              id="sellable"
              title="Computing the sellable amount"
              lede="What you hold, minus what is still locked."
            >
              <Code>{`unlockedBps(holder) =
    max( timeUnlockedBps(now - lockStart),
         reliefBps(drawdownTicks(holder)) )

lockedOf(holder) =
    min( lockedBasis * (10_000 - unlockedBps) / 10_000,
         balanceOf(holder) )

releasable(holder) = balanceOf(holder) - lockedOf(holder)`}</Code>
              <Prose>
                Which gives the guarantee the accounting exists for: after any
                buy of <Inline>amount</Inline>,{" "}
                <Inline>releasable</Inline> is exactly what it was before plus{" "}
                <Inline>amount × initialUnlockBps / 10_000</Inline>, whatever the
                holder&apos;s history.
              </Prose>
              <Prose>
                Relief is a floor, not an addition. A position deep in drawdown
                never unlocks <em>less</em> than its schedule already permits,
                and a position in profit is never penalised for it. The{" "}
                <Inline>min</Inline> against the balance matters because relief
                can recede: a holder who sold into a crash and then saw the
                price recover would otherwise be locked above what they still
                hold.
              </Prose>
              <Callout title="Rejections are invisible through the router" tone="warning">
                A sell above the limit reverts with{" "}
                <Inline>PositionLocked</Inline>, returning the amount that would
                have succeeded. Uniswap wraps transfers, so the user only ever
                sees <Inline>TF</Inline> — read <Inline>releasable</Inline>{" "}
                first and offer that amount.
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
                      "One address, written at launch and never changed. Tokens leaving toward it are a sell, and consume the position's unlock budget.",
                  },
                  {
                    term: "Wallet to wallet",
                    description:
                      "Consumes the unlock budget exactly as a sale would, so splitting a position across ten addresses does not reset its schedule. What arrives is therefore already unlocked, and the recipient is not re-locked.",
                  },
                  {
                    term: "Nothing is blocked outright",
                    description:
                      "There is no whitelist, no blocked destination, no pause and no admin. A transfer either fits inside what the position may release, or it reverts — and the receiving address opens a position of its own.",
                  },
                  {
                    term: "Protocol fees",
                    description:
                      "Fees moving from the pool to the treasury skip the buy ramp, since collection is permissionless and must not depend on the clock. They do open a position, so the protocol is bound by its own selling rules.",
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
uint256 drop   = ticksBelow(lockTick, reference);
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
                small buyer unlock on the same curve. Nothing else separates
                them either: once a position is unlocked it is an ordinary
                ERC-20 balance. Making the schedule size-aware is an open design
                question, not a shipped feature.
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
              id="graduation"
              title="Revealed"
              lede="A milestone the pool reaches. Not a migration, and not a promise."
            >
              <Prose>
                A launch past the threshold is shown as{" "}
                <strong className="font-medium text-foreground">Revealed</strong>
                . The contracts call the same thing{" "}
                <Inline>graduation</Inline> — <Inline>graduated</Inline>,{" "}
                <Inline>graduationProgress</Inline>,{" "}
                <Inline>GRADUATION_QUOTE</Inline> — and those names are
                immutable, so an integration should expect them. The word
                differs on purpose: on most launchpads graduating is when
                liquidity migrates somewhere else, and borrowing the term would
                borrow the expectation.
              </Prose>
              <ParamTable params={GRADUATION_PARAMS} />
              <Prose>
                At {GRADUATION_QUOTE_ETH} ETH the launch is called graduated.
                That is the whole of it: the same token keeps trading in the
                same pool, at the same fee tier, against the same locked
                position, on the same ticks. No liquidity is withdrawn or
                re-minted, no reserves move, no second DEX is involved, and no
                permission or tax changes.
              </Prose>
              <Callout title="A donation cannot buy it">
                Progress is the quote our own position actually holds at the
                current price, derived from its ticks and liquidity — not the
                pool&apos;s WETH balance. That balance would count a direct
                transfer or an unrelated position, so anyone could trigger
                graduation by sending ETH. A donation does not move the price,
                so it does not move progress.
              </Callout>
              <Callout title="It is not a quality signal">
                Graduation says a threshold of trading happened. It does not
                mean the token is safe, that the team is real, or that an exit
                will be available at any particular price.
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

            <DocSection
              id="devbuy"
              title="Dev buy"
              lede="The one advantage the protocol hands to a named party."
            >
              <Prose>
                A creator may buy their own token inside the launch transaction,
                through <Inline>launchWithBuy</Inline>. That means the first
                position on the curve, at the opening price, before the
                anti-sniper delay lets anyone else in. It is a real advantage
                and it is written down here rather than folded into a sentence
                about fair launches.
              </Prose>
              <ParamTable params={CREATOR_BUY_PARAMS} />
              <Callout title="Buying earlier is not selling earlier">
                Tokens bought this way are locked on the same schedule as every
                other buy. There is no path in the contracts that releases a
                creator faster — the transfer hook does not know who anyone is
                once the launch block has passed.
              </Callout>
              <Callout title="How to tell">
                Every dev buy emits <Inline>CreatorBought</Inline> from the
                launcher, in the same transaction as <Inline>Launched</Inline>. A
                launch that took the first position is distinguishable from one
                that did not, without reading pool transfers.
              </Callout>
            </DocSection>

            {/* --------------------------- Reference --------------------- */}

            <DocSection
              id="deployment"
              title="Deployment"
              lede="Where the protocol actually is, so every claim on this page can be checked."
            >
              <DefList
                items={DEPLOYMENT.map((d) => ({
                  term: `${d.label} · ${d.address}`,
                  description: d.note,
                }))}
              />
              <Prose>
                Chain id 4663. The constructor arguments and the code hashes of
                what is really in place are committed at{" "}
                <Inline>contracts/deployments/4663.json</Inline>, so a third
                party can contest the deployment without trusting this page.
              </Prose>
              <Callout title="An earlier launcher exists" tone="warning">
                <Inline>0x435383D999C0932CB7CA871d1eA324aF2e86D48E</Inline> was
                the first launcher and had a one hour unlock. It is orphaned,
                not upgraded: rules are immutable, so changing them meant a new
                contract, and any token launched on the old one keeps the old
                rules forever. Nothing here points at it.
              </Callout>
            </DocSection>

            <DocSection
              id="metadata"
              title="Token metadata"
              lede="The document a token carries, and what this interface will show of it."
            >
              <ParamTable params={METADATA_RULES} />
              <Prose>
                <Inline>metadataURI</Inline> is an argument of{" "}
                <Inline>launch</Inline>, written once with no setter. So it is
                written by whoever launched the token — not necessarily by this
                form. Everything above is therefore enforced twice: as a bound
                when this interface writes a document, and as a filter when it
                reads one.
              </Prose>
              <Callout title="Read it yourself">
                An integrator should apply the same filter rather than trust
                this one. The rules are small enough to restate: raster data URI
                for the image, length bounds on text, no control characters.
              </Callout>
            </DocSection>

            <DocSection
              id="interface"
              title="Interface"
              lede="The surface an integration needs."
            >
              <Code>{`interface IRevealLauncher {
    // Three strings. Supply, rules and tick range are not arguments.
    function launch(string calldata name, string calldata symbol,
                    string calldata metadataURI)
        external returns (address token, address pool);

    // The same, plus the creator's own buy in that transaction.
    function launchWithBuy(string calldata name, string calldata symbol,
                           string calldata metadataURI)
        external payable returns (address token, address pool);

    // The registry. Readable before any token exists, which is what lets a
    // form state the cap while it is being filled in.
    function creatorBuyCap() external view returns (uint256);
    function tokenCount() external view returns (uint256);
    function tokens(uint256 index) external view returns (address);
    function rules() external view returns (Rules memory);
    function locker() external view returns (address);
}

interface IRevealToken {
    // What may leave right now -- to the pool or to another wallet.
    function releasable(address holder) external view returns (uint256);
    // Its complement. releasable + lockedOf == balanceOf, always.
    function lockedOf(address holder) external view returns (uint256);

    // The largest buy the ramp allows at this instant, and when buys open.
    function maxBuyNow() external view returns (uint256);
    function buyOpensAt() external view returns (uint256);

    // How open the position is, and how far under water.
    function unlockedBps(address holder) external view returns (uint256);
    function drawdownTicks(address holder) external view returns (uint256);
    function twapTick() external view returns (int24 tick, bool fresh);

    // The creator's window. Zero from the block after the launch onwards.
    function creator() external view returns (address);
    function creatorBought() external view returns (uint256);
    function creatorBuyRemaining() external view returns (uint256);

    function rules() external view returns (Rules memory);
    function metadataURI() external view returns (string memory);
}

interface IRevealLocker {
    // Status milestone. Nothing here moves liquidity.
    function graduationProgress(address token) external view returns (uint256);
    function graduated(address token) external view returns (bool);
    function syncGraduation(address token) external;

    // Permissionless, and always pays the immutable treasury.
    function collect(address token) external returns (uint256, uint256);

    // The invariants worth checking yourself.
    function positionOwner(address token) external view returns (address);
    function liquidityNow(address token) external view returns (uint128);
}`}</Code>
              <Prose>
                <Inline>releasable</Inline> is the call a front end must make
                before enabling a sell button — and it is not optional. Uniswap
                wraps token transfers in its own <Inline>_safeTransfer</Inline>,
                so a rejected sell surfaces as the pool&apos;s{" "}
                <Inline>TF</Inline>, never as our custom error. Reading the
                failure afterwards tells the user nothing; reading the view
                beforehand tells them the exact amount that works.{" "}
                <Inline>maxBuyNow</Inline> is its counterpart on the buy side,
                for the same reason.
              </Prose>
              <Prose>
                <Inline>sellableNow</Inline> still exists as an alias of{" "}
                <Inline>releasable</Inline>, kept for integrations written
                against the earlier interface. There used to be two limits to
                reconcile; there is now one number.
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
                      "The Uniswap V3 position NFT is minted straight to RevealLocker and never belongs to anyone else -- not the creator, not the deployer, not the treasury, not an EOA. The locker cannot decrease liquidity, burn, approve or transfer it: those functions are absent from the interface it holds, not merely guarded. There is no owner, no rescue path and no upgrade path.",
                  },
                  {
                    term: "Trade fee",
                    description:
                      "The Uniswap V3 fee tier of the pool, accruing to that locked position. collect(token) is permissionless: anyone can trigger it, nobody can redirect it, and the locker never holds funds between calls.",
                  },
                  {
                    term: "Split by side, not by percentage",
                    description:
                      "Uniswap charges its fee on whichever asset goes in, so a buy pays in ETH and a sell pays in the token. collect sends the quote side to the immutable treasury and the token side to whoever launched it — two calls in one transaction, each with a different recipient. The share follows what was actually earned rather than a number decided in advance.",
                  },
                  {
                    term: "What a creator receives",
                    description:
                      "Tokens, in proportion to how much of their own token was sold. They arrive straight from the pool and open an ordinary position: a tenth sellable at once, all of it after unlockSeconds, and a collection re-ages the locked remainder exactly as a repurchase would. A creator is paid earlier than others are, never freer.",
                  },
                  {
                    term: "Nobody has to claim for the treasury",
                    description:
                      "Because one call pays both recipients, a creator collecting their own share pays the protocol in the same transaction. The treasury has nothing to trigger and no schedule to keep.",
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
const sellable = await token.read.releasable([holder]);`}</Code>
              <Prose>
                An indexer is not required to display a token: name, symbol and{" "}
                <Inline>metadataURI</Inline> are all readable from a plain RPC
                node. It is required for anything historical — yesterday&apos;s
                price, a holder count, a volume chart. A node answers the
                present only.
              </Prose>
              <Prose>
                This interface runs one, and it holds no database. Filtering{" "}
                <Inline>eth_getLogs</Inline> on a single pool address returns
                that pool&apos;s entire history in one call, so volume, trade
                count and the price curve are recomputed from the{" "}
                <Inline>Swap</Inline> logs on request and cached for thirty
                seconds. Holders come the same way: an ERC-20 cannot enumerate
                its own holders, so the <Inline>Transfer</Inline> logs are
                replayed into balances.
              </Prose>
              <Code>{`# every swap the pool ever emitted, in one request
curl "$RPC" -d '{"method":"eth_getLogs","params":[{
  "address":"<pool>","fromBlock":"0x0","toBlock":"latest"}]}'`}</Code>
              <Prose>
                The node caps a query at 10 000 matched logs, which the reader
                handles by halving the block range and retrying. That keeps
                working as pools age, but it stops being one request — a pool
                busy enough eventually costs several, and the answer arrives
                more slowly.
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
                      "Buying through many wallets gives each one its own independent position and its own schedule. The aim is to make that costly and visible, not impossible -- any real fix would require identity, which this protocol will not do. Once a balance is fully unlocked, splitting it across wallets is not an exploit: it is an ordinary ERC-20 doing what one does.",
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
                      "Uniswap wraps transfers, so a refused sell reaches the user as TF, not as PositionLocked. Any interface that skips the releasable view will show its users a failure it cannot explain.",
                  },
                  {
                    term: "The creator gets the first position",
                    description:
                      "launchWithBuy lets a creator buy up to 5% of the supply inside the launch block, before the anti-sniper delay opens for anyone else. Whoever buys next pays a price the creator already moved. The lock applies to them identically — it costs later buyers position, not protection — but it is an asymmetry, and it is not going to be argued away here.",
                  },
                  {
                    term: "History is recomputed, not stored",
                    description:
                      "The indexer keeps no database: every figure is rebuilt from logs on request. That means nothing to fall out of sync, and no historical claim that cannot be re-derived from the chain — but it also means the cost grows with a pool's history, and that a node refusing to serve logs takes the whole history down with it. The live price never depends on it.",
                  },
                ]}
              />
              <Callout title="No audit" tone="warning">
                The contracts are live on Robinhood Chain and nobody
                independent has reviewed them. They carry a test suite and were
                rehearsed against a fork of the chain before deployment, which
                is not the same thing as an audit and is not offered as one.
                Treat every launch here as unaudited code holding real money.
              </Callout>
            </DocSection>
          </div>
        </div>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
