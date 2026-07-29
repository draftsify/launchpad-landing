# Reveal — contracts

The protocol itself: a token whose transfer hook meters selling instead of
forbidding it. No admin, no pause, no allowlist — every parameter is chosen at
launch and there is no function that can change one afterwards.

```
RevealLauncher.launch()  →  RevealToken  +  Uniswap V2 pair  (LP burned)
```

## The three gates

Every transfer passes through `RevealToken._update`, in this order.

**1. Anti-sniper** — on buys, for the first minutes.
`launchDelay` blocks buys outright. Then `buyRamp` caps a single buy as a share
of the pool reserve, starting at 0.25% and reaching "no limit" at the end of the
ramp.

**2. Unlock** — on anything leaving a position.
A position unlocks linearly from `initialUnlockBps` to 100% over `unlockSeconds`,
counted from *entry*, not from launch. Buying again re-weights the entry time
downward, so topping up makes you younger.

Drawdown relief raises that as a **floor**, never a bonus: a position down `d`
is unlocked at least `2 × d`, so −50% opens it entirely. The reference price is
a 5-minute TWAP read from the pair's own cumulative counters — pushing spot down
for one block does not move it.

The budget is measured against `basisAmount` (everything the position ever
received) minus `releasedTotal`, not against the current balance. Measuring
against the balance is the obvious mistake: selling 10% would immediately reopen
10% of the remainder, and a position would drain in a few transactions.
`test_SellingDoesNotReopenTheSameShare` pins this.

Plain transfers consume the same budget as sells. Otherwise splitting a position
across ten addresses would walk straight through the gate.

**3. Impact cap** — on sells into the pool.
`impactCapBps` of the pool's token reserve per `impactWindow`, as a leaky bucket:
what you already sold decays linearly over the window rather than resetting on a
boundary, so you cannot sell two full caps by straddling one.

## Why Uniswap v2 and not v3 or v4

All four — v2, v3, v4, UniswapX — are live on Robinhood Chain, so availability
does not decide this. On the merits:

- **The impact cap needs a reserve.** "1% of the pool" is exactly the reserve in
  v2. In v3, `balanceOf(pool)` spans every tick range including liquidity that is
  out of range and cannot absorb the trade, so the same formula stops being a
  proxy for price impact.
- **v4 works against a transfer hook, by design.** Its singleton PoolManager
  holds every token in the protocol, so `to == pool` no longer means "a sell".
  ERC-6909 claim tokens let a swap settle with no ERC-20 transfer at all. The
  correct v4 shape is a hook contract on `beforeSwap` — which puts *more* of our
  own code in the swap path, and still needs token-level restrictions to stop
  anyone opening an unhooked pool for the same token.
- **v2 is the smallest surface.** ~200 lines, six years in production, and we add
  one hook. "Don't write your own AMM" is the right instinct and this follows it;
  between versions, more machinery is not more safety.
- Concentrated liquidity buys us nothing here: the launch position is full-range
  and burned.

Routing is not a reason to move either — the Universal Router and UniswapX quote
v2 pairs, and the Uniswap Web App supports the chain, so a launched token is
tradeable without us shipping a swap UI.

Revisit if the impact cap ever needs to key off real liquidity depth rather than
a reserve; that is the argument that would actually justify v3.

## Metadata

`RevealToken.metadataURI` is written at launch and has no setter. Image,
description and links live behind it (IPFS in practice), so the interface can
render a token by reading the chain alone.

## Known limitations

Read these before assuming the mechanism is airtight.

- **The impact cap is per address.** A holder who is already fully unlocked can
  split across N wallets and get N buckets. The unlock gate is what stops this
  for young positions — a fresh wallet restarts at `initialUnlockBps` — but it
  does not stop a holder who has waited out `unlockSeconds`. A global per-window
  cap would close it; that is a product decision, not an oversight.
- **Revert reasons do not survive the pool.** Uniswap wraps token transfers in
  `_safeTransfer`, which replaces any reason with `UniswapV2: TRANSFER_FAILED`.
  The frontend must call `sellableNow()` / `releasable()` / `windowRemaining()`
  before sending a transaction rather than parsing a failure.
  (`test_PoolMasksOurRevertReasons`)
- **The cap tracks the reserve, so it grows as you sell.** It is an impact cap,
  not a quantity cap: selling raises the token reserve, so 1% of it is slightly
  more than before. A window therefore empties to about 1% of the cap rather
  than to exactly zero.
- **A stale TWAP can be farmed at the margin.** Buying right after a crash gives
  you a basis from before it, so you look underwater and get relief. The gain is
  bounded by the TWAP window and costs real capital to set up, but it exists.
- **`RELIEF_SLOPE` is a protocol constant, not a launch parameter.** Letting a
  creator tune the exit guarantee would be the same as removing it.
- **Not audited.** Nothing here has been reviewed by anyone but its tests.

## Running it

```bash
forge build
forge test                                              # 26 tests, no network
FORK_ROBINHOOD=1 forge test --match-contract Fork -vv   # + 2 against the live chain
```

The fork tests run the protocol against Robinhood Chain's canonical Uniswap v2
factory and its real WETH — the things a mock cannot vouch for. They skip
themselves without `FORK_ROBINHOOD`, so the default suite stays offline.

Tests trade directly against the pair rather than through the router: that is
exactly the call sequence the transfer hook sees, and it avoids depending on the
init-code hash baked into `UniswapV2Library`.

`lib/v2-core` is Solidity 0.5.16 and cannot be imported from a 0.8 test, so
`test/mocks/UniswapV2Artifacts.sol` exists only to force its compilation;
the tests then instantiate it through `deployCode`.

## Deploying

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood \
  --account <keystore-name> --broadcast
```

Robinhood Chain is chain ID 4663, Arbitrum Orbit, and contract deployment is
permissionless. The script has its addresses built in, verified on-chain:

| | |
|---|---|
| UniswapV2Factory | `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Do **not** assume the OP-stack WETH predeploy `0x4200…0006` — this is an Orbit
chain and that address holds no code here. The script reverts rather than
deploying against a WETH it cannot name.

On any other chain, pass `AMM_FACTORY` and `WETH`; if `AMM_FACTORY` is omitted
the script deploys a v2 factory, which is what a bare testnet needs.

Use `--account` with a `cast wallet import` keystore rather than putting a
private key in the environment.
