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
forge test            # 25 tests
forge test -vvv       # with traces
```

Tests trade directly against the pair rather than through the router: that is
exactly the call sequence the transfer hook sees, and it avoids depending on the
init-code hash baked into `UniswapV2Library`.

`lib/v2-core` is Solidity 0.5.16 and cannot be imported from a 0.8 test, so
`test/mocks/UniswapV2Artifacts.sol` exists only to force its compilation;
the tests then instantiate it through `deployCode`.

## Deploying

```bash
export PRIVATE_KEY=0x…
forge script script/Deploy.s.sol:Deploy --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

`AMM_FACTORY` is optional — the script deploys a Uniswap V2 factory when the
chain has none, which is the usual case on a testnet. `WETH` defaults to the
OP-stack predeploy at `0x4200…0006`.
