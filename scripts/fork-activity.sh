#!/usr/bin/env bash
#
# Fabrique un historique sur le fork local, pour que l'indexeur ait quelque
# chose à relire.
#
#   bash scripts/fork-activity.sh
#
# Le fork nait avec un seul token et deux swaps collés dans le temps : une
# courbe de prix n'y a aucune forme, et rien ne tombe au-delà de 24 h, donc la
# variation journalière reste indéterminée. On étale donc des achats et des
# ventes sur plusieurs jours de temps simulé.
#
# Rien ici ne teste le protocole — c'est fait ailleurs. Le but est de donner à
# l'indexeur un cas ressemblant à un vrai marché.
set -euo pipefail

export PATH="$PATH:$HOME/.foundry/bin:/c/Users/Utilisateur/.foundry/bin"
cd "$(dirname "$0")/.."

R=http://127.0.0.1:8545
ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2
WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
MAX=115792089237316195423570985008687907853269984665640564039457584007913129639935

LAUNCHER=$(grep NEXT_PUBLIC_LAUNCHER .env.local | cut -d= -f2)
TOKEN=$(cast call "$LAUNCHER" 'tokens(uint256)(address)' 0 --rpc-url $R)

# Comptes anvil 2 à 5. Clés publiées dans la documentation de Foundry.
KEYS=(
  0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
  0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
  0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
)
ADDRS=(
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  0x90F79bf6EB2c4f870365E785982E1f101E93b906
  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
  0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
)

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
eth() { cast --to-unit "${1:-0}" ether; }

warp() {
  cast rpc evm_increaseTime "$1" --rpc-url $R >/dev/null
  cast rpc evm_mine --rpc-url $R >/dev/null
}

buy() {
  cast send $ROUTER \
    'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))(uint256)' \
    "($WETH,$TOKEN,10000,$2,$3,0,0)" \
    --value "$3" --rpc-url $R --private-key "$1" >/dev/null
}

# Une vente ne peut porter que sur ce que les règles libèrent : on demande au
# token lui-même plutôt que de deviner, et on reste juste en dessous.
sell() {
  local key=$1 who=$2 part=$3
  cast send "$TOKEN" 'approve(address,uint256)' $ROUTER $MAX \
    --rpc-url $R --private-key "$key" >/dev/null
  local s
  s=$(cast call "$TOKEN" 'sellableNow(address)(uint256)' "$who" --rpc-url $R | awk '{print $1}')
  # Pas d'arithmétique bash ici : un montant en wei dépasse 2^63 dès 9,2 ETH,
  # et $(( )) le fait silencieusement basculer en négatif. Vu, sur ce script.
  s=$(node -e "process.stdout.write((BigInt('$s')*${part}n/100n).toString())")
  [ "$s" = "0" ] && return 0
  cast send $ROUTER \
    'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))(uint256)' \
    "($TOKEN,$WETH,10000,$who,$s,0,0)" --rpc-url $R --private-key "$key" >/dev/null || true
}

step "Token visé"
echo "  $TOKEN"

step "Trois jours de temps simulé"
# Jour 1 : quatre acheteurs entrent, à des tailles différentes.
SIZES=(0.05ether 0.12ether 0.03ether 0.08ether)
for i in 0 1 2 3; do
  buy "${KEYS[$i]}" "${ADDRS[$i]}" "${SIZES[$i]}"
  warp 900
  printf '  achat %s par %s\n' "${SIZES[$i]}" "${ADDRS[$i]:0:10}"
done

# Le déblocage complet prend une heure : on la laisse passer avant de vendre.
warp 4000
step "Premières sorties"
for i in 0 2; do
  sell "${KEYS[$i]}" "${ADDRS[$i]}" 40
  warp 1200
  echo "  vente partielle par ${ADDRS[$i]:0:10}"
done

# Franchir 24 h : c'est ce qui donne un point de comparaison à la variation
# journalière. Sans lui, l'indexeur répond « pas de trade il y a 24 h ».
step "Passage de la barre des 24 h"
warp 90000
buy "${KEYS[1]}" "${ADDRS[1]}" 0.06ether
warp 3600
sell "${KEYS[3]}" "${ADDRS[3]}" 30
warp 3600
buy "${KEYS[2]}" "${ADDRS[2]}" 0.15ether
warp 1800

step "État final"
echo "  prix   : $(cast call "$TOKEN" 'pool()(address)' --rpc-url $R)"
echo "  soldes :"
for i in 0 1 2 3; do
  printf '    %s  %s\n' "${ADDRS[$i]:0:10}" \
    "$(eth "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "${ADDRS[$i]}" --rpc-url $R | awk '{print $1}')")"
done
echo
echo "  Relire : curl -s http://localhost:3000/api/activity/$TOKEN"
