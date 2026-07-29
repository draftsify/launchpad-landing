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

The position is owned by `RevealFees`, which exposes exactly one gesture:
`burn(lower, upper, 0)`. The zero is hardcoded and never a parameter — in V3 a
zero burn realises accrued fees without touching liquidity, and only a non-zero
amount would withdraw it. No path through this contract can produce one, so the
liquidity is as locked as it would be under a dead address while the fees stay
reachable.

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

The budget is `basisAmount` (everything the position ever received) minus
`releasedTotal`, never the current balance — against the balance, selling 10%
reopens 10% of the remainder and a position drains in a few transactions.
Plain transfers consume the same budget, so splitting across addresses does not
walk through the gate.

**3. Impact cap** — on sells into the pool. `impactCapBps` of the quote reserve
per `impactWindow`, as a leaky bucket that decays rather than resetting on a
boundary. Denominated in quote, not tokens: on the token side it would equal
the entire supply at launch. Consequence, intended: nothing is sellable until
someone has bought.

## Two asymmetries that are load-bearing

**Entry price is spot; current price is TWAP.** The TWAP lags by minutes, so
using it for entry would credit a buyer during a fast run-up with a price far
below what they paid — they would look permanently in profit and never earn the
relief their real loss deserves. Spot is safe for entry: V3 updates `slot0`
before calling us, so it is the marginal price just paid, and inflating it to
manufacture future relief means buying at that inflated price. The current
price must stay a TWAP, because that is the side where manipulation pays.

**The impact cap reads a mark taken on buys, never live during a sell.** V3
sends the swap output *before* invoking the callback where our hook runs, so a
live read is already short by the proceeds of the very sell being checked, and
the view would promise more than the transaction accepts.

## Known limitations

- **Revert reasons do not survive the pool.** Uniswap wraps token transfers, so
  any failure surfaces as `TF`. The frontend must call `sellableNow()` /
  `releasable()` / `windowRemaining()` before sending a transaction rather than
  parsing a failure. The incumbent launchpad on this chain removed its trading
  restrictions in V2 for exactly this reason — third-party apps were seeing
  unexplained failed transactions. Keeping the restrictions is a deliberate
  product choice made with that precedent in view.
- **The impact cap is per address.** A fully-unlocked holder can split across
  wallets and get one bucket each. The unlock gate stops this for young
  positions — a fresh wallet restarts at `initialUnlockBps` — but not for one
  that waited out `unlockSeconds`.
- **A second pool at another fee tier is not covered.** Sells routed there are
  treated as plain transfers: still charged against the unlock budget, but
  outside the impact cap.
- **The TWAP needs trading history.** With too few swaps for the configured
  observation cardinality, `observe` reverts and no relief is granted — the
  conservative direction, but relief becomes unavailable rather than
  approximate.
- **Not audited.** Nothing here has been reviewed by anyone but its tests.

## Running it

```bash
forge build
forge test          # 13 tests
```

Tests trade through a minimal router that pays by `transferFrom` from the
account swapping — the exact sequence the hook sees when a real router fills an
order.

v3-core is Solidity 0.7.6 and cannot be imported from a 0.8 test, so
`test/mocks/UniswapV3Artifacts.sol` forces its compilation and the tests
instantiate it with `deployCode`. `TickMath` does not compile under 0.8 at all;
`TickMathExposer` publishes the canonical version so the range constants are
computed rather than transcribed by hand.

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
