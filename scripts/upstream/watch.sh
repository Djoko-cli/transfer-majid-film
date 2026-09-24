#!/usr/bin/env bash
# Liste les commits de pingvin-share-x arrivés depuis la séparation et pas
# encore repris ici, et tient à jour un ticket qui les montre.
#
#   bash scripts/upstream/watch.sh            (dans le workflow, avec GH_TOKEN)
#   bash scripts/upstream/watch.sh --dry-run  (en local : affiche, ne publie rien)
#
# Un vrai fork GitHub n'aurait rien apporté ici : son bouton « Sync fork » ne
# marche que si les branches fusionnent proprement, et les deux projets ont
# divergé sur des centaines de fichiers depuis le 15 août 2026. Suivre
# l'amont, c'est reprendre ses correctifs un par un — ce script dit lesquels
# restent à regarder.
#
# Un commit sort de la liste dès qu'il est repris, reconnu de deux façons :
#  - `git cherry` trouve ici un changement identique, quel que soit son SHA ;
#  - un commit d'ici porte la mention « cherry picked from commit <sha> »
#    qu'ajoute `git cherry-pick -x` — ce qui couvre aussi un commit repris
#    avec des retouches, dont le contenu n'est plus identique.
# Et il en sort aussi quand on l'écarte exprès, dans ignored.txt.

set -euo pipefail

AMONT_URL="https://github.com/smp46/pingvin-share-x.git"
AMONT_WEB="https://github.com/smp46/pingvin-share-x"
BRANCHE_AMONT="main"
ETIQUETTE="amont"
TITRE="Amont : commits de pingvin-share-x à examiner"
ECARTES="scripts/upstream/ignored.txt"

essai=false
[ "${1:-}" = "--dry-run" ] && essai=true

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$AMONT_URL"
git fetch --quiet upstream "$BRANCHE_AMONT"
amont="upstream/$BRANCHE_AMONT"

repris=$(git log HEAD --format=%B |
  grep -oE 'cherry picked from commit [0-9a-f]{40}' | awk '{print $5}' | sort -u || true)
ecartes=$(grep -oE '^[0-9a-f]{7,40}' "$ECARTES" 2>/dev/null || true)

# Du plus récent au plus ancien, pour que le haut du ticket soit ce qui vient
# d'arriver. Les fusions sont sautées : leur contenu est dans leurs parents.
# Des listes d'une ligne par SHA plutôt que des tableaux : le bash 3.2 de
# macOS refuse de parcourir un tableau vide sous `set -u`, et l'essai à
# blanc doit marcher en local aussi.
a_examiner=""
while read -r signe sha; do
  [ "$signe" = "-" ] && continue
  [ "$(git rev-list --parents -n 1 "$sha" | wc -w)" -gt 2 ] && continue
  grep -qx "$sha" <<<"$repris" && continue
  for e in $ecartes; do [[ $sha == "$e"* ]] && continue 2; done
  a_examiner="$sha"$'\n'"$a_examiner"
done < <(git cherry HEAD "$amont")
nombre=$(grep -c . <<<"$a_examiner" || true)

ligne() {
  local sha=$1 sujet
  sujet=$(git log -1 --format=%s "$sha" | sed 's/|/\\|/g')
  echo "| [\`${sha:0:7}\`]($AMONT_WEB/commit/$sha) | $(git log -1 --format=%as "$sha") | $sujet |"
}

corps=$(
  echo "<!-- suivi-amont -->"
  echo "**$nombre commit(s)** de [pingvin-share-x]($AMONT_WEB) arrivés depuis la séparation et pas encore repris ici. Ce ticket est tenu à jour chaque lundi par \`.github/workflows/upstream-watch.yml\`."
  echo
  echo "- Pour en reprendre un : \`git cherry-pick -x <sha>\`. Le \`-x\` laisse la mention qui le retire d'ici, même si on le retouche."
  echo "- Pour en écarter un : ajouter son SHA, avec la raison, à \`$ECARTES\`."
  echo
  echo "| Commit | Date | Sujet |"
  echo "|---|---|---|"
  while read -r sha; do if [ -n "$sha" ]; then ligne "$sha"; fi; done <<<"$a_examiner"
)

if $essai; then
  echo "$corps"
  exit 0
fi

ticket=$(gh issue list --label "$ETIQUETTE" --state open --limit 1 --json number --jq '.[0].number // empty')

if [ "$nombre" -eq 0 ]; then
  if [ -n "$ticket" ]; then
    gh issue comment "$ticket" --body "Plus rien à examiner : tout ce que pingvin-share-x a publié est repris ou écarté."
    gh issue close "$ticket"
  fi
  exit 0
fi

if [ -z "$ticket" ]; then
  gh label create "$ETIQUETTE" --color "c75f00" \
    --description "Commits de pingvin-share-x à examiner" --force >/dev/null
  gh issue create --title "$TITRE" --label "$ETIQUETTE" --body "$corps"
  exit 0
fi

# Modifier un ticket ne notifie personne ; un commentaire, si. On n'en laisse
# un que lorsque de nouveaux commits sont apparus depuis la dernière fois.
deja=$(gh issue view "$ticket" --json body --jq .body | grep -oE 'commit/[0-9a-f]{40}' | cut -d/ -f2 || true)
nouveaux=""
while read -r sha; do
  if [ -n "$sha" ] && ! grep -qx "$sha" <<<"$deja"; then
    nouveaux="$nouveaux$sha"$'\n'
  fi
done <<<"$a_examiner"
nombre_nouveaux=$(grep -c . <<<"$nouveaux" || true)

gh issue edit "$ticket" --body "$corps" >/dev/null
if [ "$nombre_nouveaux" -gt 0 ]; then
  gh issue comment "$ticket" --body "$(
    echo "**$nombre_nouveaux nouveau(x)** depuis la dernière fois :"
    echo
    echo "| Commit | Date | Sujet |"
    echo "|---|---|---|"
    while read -r sha; do if [ -n "$sha" ]; then ligne "$sha"; fi; done <<<"$nouveaux"
  )"
fi
