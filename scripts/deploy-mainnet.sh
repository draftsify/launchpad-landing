#!/usr/bin/env bash
#
# Déploiement du launcher sur Robinhood Chain.
#
#   TREASURY=0x… ACCOUNT=deployer bash scripts/deploy-mainnet.sh
#
# À exécuter par le propriétaire des clés, pas par un agent : `forge` demande
# le mot de passe du keystore de façon interactive, et c'est très bien ainsi.
# Aucune clé privée n'apparaît ni ne doit apparaître dans ce fichier, dans un
# historique de shell ou dans une conversation.
#
# Créer le keystore, une seule fois, en tapant la clé soi-même :
#
#   cast wallet import deployer --interactive
#   cast wallet address --account deployer
#
# La clé est alors chiffrée sous ~/.foundry/keystores/deployer. Elle ne quitte
# jamais la machine.
#
# CE QUI EST IRRÉVERSIBLE : la trésorerie. Elle est inscrite dans le
# constructeur de RevealLocker, qui n'expose aucune fonction pour la changer. Une
# adresse fausse envoie tous les frais de swap, pour toujours, à un endroit dont
# personne n'a la clé. Le launcher aussi est immuable : les règles déployées
# s'appliquent à tous les tokens qui en sortiront.
set -euo pipefail

export PATH="$PATH:$HOME/.foundry/bin:/c/Users/Utilisateur/.foundry/bin"
cd "$(dirname "$0")/../contracts"

RPC=https://rpc.mainnet.chain.robinhood.com
EXPLORER=https://robinhoodchain.blockscout.com

# Des tests explicites plutôt que ${VAR:?message} : bash continue de parser le
# message d'une expansion, donc une apostrophe dans « l'adresse » y ouvre une
# quote et casse le fichier entier. Vu, sur ce script.
# La trésorerie vit dans script/Deploy.s.sol, versionnée. Reprise ici pour être
# affichée avant d'être gravée : passer TREASURY= la remplace, ce qui reste
# possible mais doit être un geste délibéré — et exige d'avoir vérifié que la
# clé de l'adresse n'a jamais été partagée, collée ni exportée.
TREASURY="${TREASURY:-0xa40679bC2f4f5B51Edb05E7A2D573292A3479c62}"
if [ -z "${ACCOUNT:-}" ]; then
  echo "ACCOUNT manquant : nom du keystore, par exemple ACCOUNT=deployer." >&2
  echo "  Le créer une fois : cast wallet import deployer --interactive" >&2
  exit 1
fi

# Une clé privée fait 64 caractères hexadécimaux, une adresse 40 précédés de
# 0x. Les confondre est l'erreur qui coûte le plus cher ici, donc on refuse
# tout ce qui n'a pas exactement la forme d'une adresse.
if ! [[ "$TREASURY" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "TREASURY n'a pas la forme d'une adresse (0x + 40 hexadécimaux)." >&2
  echo "Si ce que vous avez fait 64 caractères, c'est une clé privée : ne la" >&2
  echo "collez nulle part. Son adresse se lit avec cast wallet address." >&2
  exit 1
fi

SENDER=$(cast wallet address --account "$ACCOUNT")
BALANCE=$(cast balance "$SENDER" --rpc-url $RPC)
GAS_PRICE=$(cast gas-price --rpc-url $RPC)

# Mesuré en simulant ce script contre la chaîne elle-même : 8 061 917 pour le
# déploiement, 18 125 985 pour un premier lancement avec une image inscrite sur
# la chaîne. La marge de trois couvre une variation du prix du gas entre
# l'estimation et l'inclusion.
NEEDED=$(node -e "process.stdout.write(((8061917n+18125985n)*${GAS_PRICE}n*3n).toString())")

printf '\n\033[1mCe qui va être déployé\033[0m\n'
echo "  chaîne     : Robinhood Chain (4663)"
echo "  déployeur  : $SENDER"
echo "  solde      : $(cast --to-unit "$BALANCE" ether) ETH"
echo "  nécessaire : $(cast --to-unit "$NEEDED" ether) ETH (déploiement + un lancement, marge x3)"
echo
printf '  \033[1mtrésorerie : %s\033[0m\n' "$TREASURY"
echo "  ^ immuable. Vérifiez-la caractère par caractère avant de continuer."
echo
echo "  frais      : 100 % à la trésorerie, aucune part créateur"
echo "  règles     : 10 % vendable au lancement, tout ouvert en 1 h,"
echo "               délai anti-sniper 5 s, rampe d'achat 10 min"
echo "  courbe     : ticks -204200/887200, liquidité 36819258015569838458222"
echo "               — la configuration du launchpad de référence, au tick près"
echo "  graduation : 4.2 ETH, statut seulement — rien ne migre"

if [ "$(node -e "process.stdout.write(BigInt('$BALANCE')<BigInt('$NEEDED')?'1':'0')")" = "1" ]; then
  echo
  echo "Solde insuffisant. Financez $SENDER puis relancez." >&2
  exit 1
fi

echo
read -r -p "Taper exactement DEPLOY pour continuer : " CONFIRM
[ "$CONFIRM" = "DEPLOY" ] || { echo "Annulé."; exit 1; }

printf '\n\033[1mDéploiement\033[0m\n'
TREASURY="$TREASURY" forge script script/Deploy.s.sol:Deploy \
  --rpc-url $RPC --account "$ACCOUNT" --sender "$SENDER" --broadcast

LAUNCHER=$(node -e "
  const r = require('./broadcast/Deploy.s.sol/4663/run-latest.json');
  const t = r.transactions.find(t => t.contractName === 'RevealLauncher');
  process.stdout.write(t.contractAddress);
")
LOCKER=$(cast call "$LAUNCHER" 'locker()(address)' --rpc-url $RPC)

# Relu sur la chaîne, jamais depuis ce script : ce qui compte est ce que le
# contrat dit de lui-même une fois déployé.
printf '\n\033[1mVérification sur la chaîne\033[0m\n'
echo "  RevealLauncher : $LAUNCHER"
echo "  RevealLocker   : $LOCKER"
echo "  trésorerie lue : $(cast call "$LOCKER" 'treasury()(address)' --rpc-url $RPC)"
echo "  règles lues    : $(cast call "$LAUNCHER" 'rules()(uint16,uint32,uint32,uint32)' --rpc-url $RPC | tr '\n' ' ')"
echo "  liquidité t0   : $(cast call "$LAUNCHER" 'expectedLiquidity(bool)(uint128)' true --rpc-url $RPC)"
echo "  liquidité t1   : $(cast call "$LAUNCHER" 'expectedLiquidity(bool)(uint128)' false --rpc-url $RPC)"
echo "  ^ doit valoir 36819258015569838458222 dans les deux cas"
echo "  seuil gradu.   : $(cast call "$LOCKER" 'GRADUATION_QUOTE()(uint256)' --rpc-url $RPC)"
echo "  manifeste      : contracts/deployments/4663.json"
echo "  explorateur    : $EXPLORER/address/$LAUNCHER"

printf '\n\033[1mIl reste à faire\033[0m\n'
cat <<NEXT
  1. Publier le code source, pour que la trésorerie et les règles soient
     lisibles par n'importe qui sans faire confiance à ce script :

       forge verify-contract $LAUNCHER src/RevealLauncher.sol:RevealLauncher \\
         --chain-id 4663 --verifier blockscout \\
         --verifier-url $EXPLORER/api

       forge verify-contract $LOCKER src/RevealLocker.sol:RevealLocker \\
         --chain-id 4663 --verifier blockscout \\
         --verifier-url $EXPLORER/api

  2. Pointer le site dessus, dans les variables d'environnement Vercel :

       vercel env add NEXT_PUBLIC_LAUNCHER production --scope draftsifys-projects
       # valeur : $LAUNCHER
       vercel deploy --prod --yes --scope draftsifys-projects

  3. Committer contracts/deployments/4663.json : il porte les paramètres du
     constructeur et l'empreinte du code réellement en place, donc il rend le
     déploiement contestable par un tiers.

  4. Lancer un token de test avec un petit montant, et vérifier qu'un achat
     puis une vente passent, avant d'annoncer quoi que ce soit.

  5. Seulement ensuite, ouvrir les lancements au public :

       vercel env add NEXT_PUBLIC_LAUNCHES_OPEN production --scope draftsifys-projects
       # valeur : true

     C'est un interrupteur séparé du précédent, et volontairement : déployer
     n'ouvre pas le site, ce qui laisse le temps de tout vérifier soi-même.
NEXT
