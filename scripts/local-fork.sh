#!/usr/bin/env bash
#
# Chaîne de test locale : un fork de Robinhood Chain, le protocole déployé
# dessus, et un token déjà lancé.
#
#   bash scripts/local-fork.sh
#
# Pourquoi un fork et pas une chaîne vierge : anvil garde le chainId à 4663,
# donc la factory Uniswap V3, le WETH, le SwapRouter02 et le QuoterV2 déjà
# déployés là-bas sont à leurs vraies adresses. C'est le protocole réel qui est
# exercé, avec de l'argent qui n'existe pas.
#
# Le RPC public de Robinhood n'est pas un nœud archive : il ne sert l'état que
# pour les blocs très récents. Passé quelques minutes, le fork ne peut plus
# charger un compte qu'il n'a pas déjà vu, et échoue sur « metadata is not
# found ». D'où le préchauffage ci-dessous : on touche tout ce dont on aura
# besoin dans les secondes qui suivent le fork, anvil le met en cache, et la
# chaîne devient autonome pour le reste de la session.
set -euo pipefail

export PATH="$PATH:$HOME/.foundry/bin:/c/Users/Utilisateur/.foundry/bin"
cd "$(dirname "$0")/.."

R=http://127.0.0.1:8545
UPSTREAM=https://rpc.mainnet.chain.robinhood.com

# Adresses vérifiées sur la chaîne. Le routeur et le quoter sont ceux dont
# `factory()` rend notre factory : il en existe une douzaine d'autres, branchés
# sur d'autres factories, qui ne verraient jamais nos pools.
FACTORY=0x1f7d7550B1b028f7571E69A784071F0205FD2EfA
WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2
QUOTER=0x962dd0B5012982bB8b4dfe7050c0d46333Dd16CF

# Comptes anvil 0 à 2. Clés publiées dans la documentation de Foundry, connues
# de tout le monde, sans valeur ailleurs que sur cette chaîne jetable.
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

MAX=115792089237316195423570985008687907853269984665640564039457584007913129639935

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
eth() { cast --to-unit "${1:-0}" ether; }

step "Fork de Robinhood Chain"
if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command \
    "Get-Process anvil -ErrorAction SilentlyContinue | Stop-Process -Force" >/dev/null 2>&1 || true
else
  pkill -f anvil >/dev/null 2>&1 || true
fi
sleep 1
nohup anvil --fork-url "$UPSTREAM" --port 8545 --silent > /tmp/anvil.log 2>&1 &
for _ in $(seq 1 60); do
  cast chain-id --rpc-url $R >/dev/null 2>&1 && break
  sleep 0.5
done
echo "  chainId $(cast chain-id --rpc-url $R), bloc $(cast block-number --rpc-url $R)"

step "Préchauffage — charger l'état amont avant qu'il ne soit plus servi"
for a in $FACTORY $WETH $ROUTER $QUOTER; do
  printf '  %s  %s octets de code\n' "$a" "$(( $(cast code "$a" --rpc-url $R | wc -c) / 2 ))"
done
# Le code ne suffit pas : chaque *slot* lu doit l'être aussi. Le WETH de cette
# chaîne est un proxy, donc son solde et ses allowances vivent dans des slots de
# mapping calculés par adresse — inatteignables plus tard. On les touche tous
# maintenant, pour chaque compte que l'interface utilisera.
# Les six premiers comptes anvil, pas seulement ceux que ce script utilise :
# scripts/fork-activity.sh se sert des suivants, et un compte non préchauffé
# devient illisible dès que l'amont cesse de servir le bloc forké.
for a in $A0 $A1 \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
  0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc; do
  cast call $WETH 'balanceOf(address)(uint256)' "$a" --rpc-url $R >/dev/null
  cast call $WETH 'allowance(address,address)(uint256)' "$a" $ROUTER --rpc-url $R >/dev/null
done
for a in $WETH $ROUTER $QUOTER $FACTORY; do
  cast call $WETH 'balanceOf(address)(uint256)' "$a" --rpc-url $R >/dev/null
done
echo "  soldes et allowances WETH en cache pour 6 comptes et 4 contrats"

step "Déploiement du protocole"
pushd contracts >/dev/null
forge script script/Deploy.s.sol:Deploy --rpc-url $R --broadcast --unlocked \
  --sender $A0 >/dev/null 2>&1
LAUNCHER=$(node -e "
  const r = require('./broadcast/Deploy.s.sol/4663/run-latest.json');
  const t = r.transactions.find(t => t.contractName === 'RevealLauncher');
  process.stdout.write(t.contractAddress);
")
popd >/dev/null
FEES=$(cast call "$LAUNCHER" 'fees()(address)' --rpc-url $R)
echo "  RevealLauncher $LAUNCHER"
echo "  RevealFees     $FEES"
echo "  treasury       $(cast call "$FEES" 'treasury()(address)' --rpc-url $R)"

step "Un token, lancé"
cast send "$LAUNCHER" 'launch(string,string,string)' \
  "Test Coin" "TEST" "data:application/json,{\"description\":\"local\"}" \
  --rpc-url $R --private-key $K0 >/dev/null
TOKEN=$(cast call "$LAUNCHER" 'tokens(uint256)(address)' 0 --rpc-url $R)
POOL=$(cast call "$TOKEN" 'pool()(address)' --rpc-url $R)
echo "  token $TOKEN"
echo "  pool  $POOL"

step "Le routeur canonique voit le pool"
echo "  getPool -> $(cast call $FACTORY 'getPool(address,address,uint24)(address)' \
  "$TOKEN" $WETH 10000 --rpc-url $R)"

# Le quoter simule l'achat pour de vrai : il se heurte donc aux mêmes gardes que
# lui. Pendant le délai anti-sniper ou au-dessus de la rampe, il revert — et
# comme Uniswap emballe nos erreurs, le motif rendu est « TF ». Toute interface
# doit lire cet échec comme « pas encore » et non comme « pool cassé ».
quote() {
  cast call $QUOTER \
    'quoteExactInputSingle((address,address,uint256,uint24,uint160))(uint256,uint160,uint32,uint256)' \
    "($1,$2,$3,10000,0)" --rpc-url $R 2>/dev/null | head -1 | awk '{print $1}'
}
Q=$(quote $WETH "$TOKEN" 100000000000000000 || true)
[ -n "${Q:-}" ] \
  && echo "  quote pendant le délai  -> $(eth "$Q")" \
  || echo "  quote pendant le délai  -> refusée (anti-sniper), attendu"

step "Achat en ETH natif, sans aucun approve"
# La rampe anti-sniper est ouverte à 5 s ; on la laisse passer entièrement.
cast rpc evm_increaseTime 700 --rpc-url $R >/dev/null
cast rpc evm_mine --rpc-url $R >/dev/null
Q=$(quote $WETH "$TOKEN" 100000000000000000 || true)
echo "  quote après la rampe    -> $(eth "${Q:-0}") tokens"
cast send $ROUTER \
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))(uint256)' \
  "($WETH,$TOKEN,10000,$A1,100000000000000000,0,0)" \
  --value 0.1ether --rpc-url $R --private-key $K1 >/dev/null
echo "  tokens reçus : $(eth "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}')")"
echo "  WETH du pool : $(eth "$(cast call $WETH 'balanceOf(address)(uint256)' "$POOL" --rpc-url $R | awk '{print $1}')") (avancé par personne)"

step "Ce que les règles autorisent"
echo "  unlockedBps  : $(cast call "$TOKEN" 'unlockedBps(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}') / 10000"
echo "  sellableNow  : $(eth "$(cast call "$TOKEN" 'sellableNow(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}')")"

step "Vente du montant annoncé, par le routeur canonique"
cast send "$TOKEN" 'approve(address,uint256)' $ROUTER $MAX --rpc-url $R --private-key $K1 >/dev/null
S=$(cast call "$TOKEN" 'sellableNow(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}')
B=$(cast call $WETH 'balanceOf(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}')
cast send $ROUTER \
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))(uint256)' \
  "($TOKEN,$WETH,10000,$A1,$S,0,0)" --rpc-url $R --private-key $K1 >/dev/null
Aa=$(cast call $WETH 'balanceOf(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}')
echo "  WETH reçu    : $(eth "$((Aa - B))")"

step "Une vente au-delà : refusée"
if cast send $ROUTER \
  'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))(uint256)' \
  "($TOKEN,$WETH,10000,$A1,$(cast call "$TOKEN" 'balanceOf(address)(uint256)' $A1 --rpc-url $R | awk '{print $1}'),0,0)" \
  --rpc-url $R --private-key $K1 >/dev/null 2>&1; then
  echo "  ❌ passée"
else
  echo "  ✅ refusée"
fi

cat > .env.local <<ENV
# Écrit par scripts/local-fork.sh. Ignoré par git : la production vise le vrai
# nœud. Ne pas construire pour la production tant que ce fichier existe.
NEXT_PUBLIC_RPC_URL=$R
NEXT_PUBLIC_LAUNCHER=$LAUNCHER
ENV

step "Prêt"
echo "  .env.local écrit. npm run dev, puis http://localhost:3000"
echo "  Wallet : réseau $R, chainId 4663 — compte $A0"
