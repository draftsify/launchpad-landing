# Reveal — contracts

The protocol itself: a token whose transfer hook meters selling. No admin, no
pause, no allowlist, and no function that can change a rule after deployment.

The rules are the protocol's, not the creator's: they live on the launcher and
are identical for every token. Letting each creator pick how constrained they
are is not a constraint, and it makes two launches incomparable — which matters
here, because "10% of the pool per window" only means something against a
reference everyone shares.

```
RevealLauncher.launch()  →  RevealToken  +  Uniswap V3 pool  (position locked)
```

## Nobody funds a launch

The whole supply is placed in a V3 tick range on one side of the starting
price, so the position is 100% token and 0% quote. Buyers' ETH is what becomes
the liquidity, as their trades push the price through the range. A creator pays
gas and nothing else.

Uniswap V2 cannot do this — it requires both sides of a pair — which is the
real reason this runs on V3, not any security argument.

## Fees

The Uniswap V3 position NFT is minted straight to `RevealLocker` and belongs
to no one else at any point — not the creator, not the deployer, not the
treasury, not an EOA. There is no intermediate step to intercept.

The guarantee is absence, not access control. The interface the locker holds,
`INonfungiblePositionManager`, does not declare `decreaseLiquidity`, `burn`,
`approve`, `setApprovalForAll` or `transferFrom`, so the contract cannot call
them even by mistake. It has no fallback, no arbitrary call, no `delegatecall`,
no rescue function, no owner and no upgrade path. `collect` goes through the
position manager, which realises accrued fees without touching principal, and
always pays the `treasury` fixed at deployment — anyone may trigger it, nobody
can redirect it, and the contract never holds the funds.

Minting the position to `0xdEaD` locks the liquidity but buries the fees with
it. That was the previous behaviour and it meant the protocol earned nothing.

`collect` is permissionless and always pays the treasury: no key is needed to
run it and nobody can redirect it. The contract never holds the funds — the
pool sends them straight on. Tokens received as fees still carry a position, so
the treasury sells under the same rules as everyone else.

The split is 100% protocol. Worth knowing: the dominant launchpad on this chain
pays creators 70%.

Supply, like the rules, is fixed at the launcher. The tick range fixes a
price per token, so opening market cap is supply × that price — a variable
supply would move the opening valuation with it.

## The three gates

Every transfer passes through `RevealToken._update`, in this order.

**1. Anti-sniper** — on buys, for the first minutes. `launchDelay` blocks buys
outright; then `buyRamp` caps a single buy as a share of total supply, from
0.25% up to unrestricted. Total supply is the denominator deliberately: the
pool's balance is the whole supply at launch, and circulating supply is zero —
measuring against either would make the first buy impossible or unbounded.

**2. Unlock** — on anything leaving a position. Linear from `initialUnlockBps`
to 100% over `unlockSeconds`, counted from *entry*. Buying again re-weights
entry time downward.

Drawdown relief raises that as a **floor**: 6,932 ticks below entry is a
halving, and a halving releases the position entirely. Measured in ticks
because V3's oracle returns a tick, and 1.0001^n is not something to compute
on-chain.

What is free is a subtraction, not a ledger: `balanceOf - lockedOf`. A buy
adds the locked share of the new purchase to whatever is *still* locked and
restarts the clock on the sum, which makes the guarantee exact — after any buy,
`releasable` is what it was plus `amount × initialUnlockBps / 10_000`,
whatever the holder's history.

An earlier version kept a running `releasedTotal` and compared it to a
recomputed budget. That debt outlived the position: exit almost entirely, leave
a wei of dust, buy again, and the old debt was charged against the new purchase
— which then started with nothing releasable. There is now no debt to outlive
anything.

Plain transfers consume the same budget, so splitting across addresses does not
walk through the gate. What leaves was therefore already unlocked, and the
recipient is never re-locked.

There was a third gate, an impact cap denominated in the pool's quote reserve.
It is gone. See below.

## Two asymmetries that are load-bearing

**Entry price is spot; current price is TWAP — and relief waits a full
window.** The TWAP lags by minutes, so using it for entry would credit a buyer
during a fast run-up with a price far below what they paid: they would look
permanently in profit and never earn the relief their real loss deserves. Spot
is safe for entry — V3 updates `slot0` before calling us, so it is the marginal
price just paid. The current price must stay a TWAP, because that is the side
where manipulation pays.

The two are only comparable once `TWAP_PERIOD` has elapsed since the buy, and
that delay is load-bearing rather than cosmetic. Without it, a buy large enough
to move the tick by more than 6,932 steps — a doubling, unremarkable on a
one-sided pool that has just opened — declared itself down 50% in the very
block it executed, took 100% relief and left the unlock schedule entirely.
Measured: 10,967 ticks of fabricated loss for a single one-ether buy. After a
full window the average contains no pre-buy price, so a flat market gives
exactly zero drawdown while a real fall still registers.

**Nothing claims an exact share of the quote reserve.** V3 sends the swap
output *before* invoking the callback where our hook runs: on a sell the
reserve is already short by the proceeds of the very sell being checked, and on
a buy the incoming quote has not arrived and had to be estimated at the
marginal price — while the buy was paid at the trip's average. At the edge of a
one-sided position the gap approaches a factor of two: a cap advertised at 10%
let through 17.3% of the real reserve. An honest figure is not derivable from
an ERC-20 hook, so none is advertised and the cap was removed rather than
relabelled.

## Known limitations

- **Revert reasons do not survive the pool.** Uniswap wraps token transfers, so
  any failure surfaces as `TF`. The frontend must call `releasable()` and
  `maxBuyNow()` before sending a transaction rather than parsing a failure. The incumbent launchpad on this chain removed its trading
  restrictions in V2 for exactly this reason — third-party apps were seeing
  unexplained failed transactions. Keeping the restrictions is a deliberate
  product choice made with that precedent in view.
- **Fully unlocked means fully free, and that is deliberate.** Once a position
  has passed `unlockSeconds` it is an ordinary ERC-20 balance: sellable,
  transferable, splittable across wallets. Multiple buyers using multiple
  wallets get independent positions, and preventing that would require identity.
  Post-unlock secondary-pool trading is not an exploit and is not described as
  one.
- **Relief is not monotonic.** A crash can unlock a position that a recovery
  then re-locks, so `releasable` can fall as well as rise. `lockedOf` is capped
  at the balance so the accounting stays exact, and the time component still
  reaches 100% at `unlockSeconds` regardless of what the price did.
- **A second pool at another fee tier is not covered.** Sells routed there are
  treated as plain transfers — still charged against the position's unlock
  budget, which is the guarantee that matters: an alternative pool cannot
  release more inventory than the holder was allowed to move. Once a balance is
  fully unlocked, trading it elsewhere is not an exploit.
- **The TWAP needs trading history.** With too few swaps for the configured
  observation cardinality, `observe` reverts and no relief is granted — the
  conservative direction, but relief becomes unavailable rather than
  approximate.
- **Not audited.** Nothing here has been reviewed by anyone but its tests.

## Running it

```bash
forge build
forge test          # 79 tests, 5 of them stateful invariants
forge test --no-match-contract RevealForkRobinhood   # no network needed
```

Tests trade through a minimal router that pays by `transferFrom` from the
account swapping — the exact sequence the hook sees when a real router fills an
order.

v3-core is Solidity 0.7.6 and cannot be imported from a 0.8 test, so
`test/mocks/UniswapV3Artifacts.sol` forces its compilation and the tests
instantiate it with `deployCode`.

`TickMath` is vendored into `src/libraries` rather than queried off-chain, so
the launcher derives its own starting price and anyone can recompute it from
the tick alone. `TickMathParity` fuzzes the port against the canonical 0.7.6
library across the whole tick range.

The `NonfungiblePositionManager` is doubled locally. v3-periphery is pinned to
0.7.6 and OpenZeppelin 3.4, and its `PoolAddress` hardcodes the init-code hash
of Uniswap's *own* build of the pool — recompiled here, that hash differs and
the manager looks for pools at addresses that do not exist. A local copy would
give false confidence rather than coverage. `RevealForkRobinhood` therefore
runs the whole lifecycle against the real manager on the real chain, and is
what validates the double.

## Deploying

```bash
cast wallet import deployer --interactive
forge script script/Deploy.s.sol:Deploy --rpc-url robinhood \
  --account deployer --broadcast
```

Robinhood Chain is chain ID 4663, Arbitrum Orbit, and contract deployment is
permissionless. Addresses are built in, verified on-chain:

| | |
|---|---|
| UniswapV3Factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Do **not** assume the OP-stack WETH predeploy `0x4200…0006` — this is an Orbit
chain and that address holds no code here. On any other chain pass
`AMM_FACTORY` and `WETH`; the script reverts rather than guessing.
