#!/usr/bin/env bash
# Report which adopted sources have moved since omc-slim last synced with them.
#
# Reads the pins in UPSTREAM.tsv, checks each source, prints one line per entry.
# Read-only: clones to a temp dir, touches nothing in your working tree.
#
#   ./scripts/check-upstream.sh          # check everything
#   ./scripts/check-upstream.sh karpathy # check entries matching a pattern
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PINS="$ROOT/UPSTREAM.tsv"
FILTER="${1:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$PINS" ] || { echo "missing $PINS"; exit 1; }

moved=0

while IFS=$'\t' read -r kind name pin source; do
  case "$kind" in ''|'#'*) continue ;; esac
  [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]] && continue

  case "$kind" in
    git)
      # Ask the remote for its default-branch head without cloning.
      head="$(git ls-remote "$source" HEAD 2>/dev/null | awk '{print $1}')"
      if [ -z "$head" ]; then
        printf '  %-22s UNREACHABLE  %s\n' "$name" "$source"
      elif [ "$head" = "$pin" ]; then
        printf '  %-22s current      %s\n' "$name" "${pin:0:12}"
      else
        printf '  %-22s MOVED        %s -> %s\n' "$name" "${pin:0:12}" "${head:0:12}"
        printf '  %-22s   diff: git clone %s %s && git -C %s diff %s..%s\n' \
               "" "$source" "/tmp/$name" "/tmp/$name" "$pin" "$head"
        moved=$((moved + 1))
      fi
      ;;
    archived)
      # Fully adopted, then deleted from the machine on purpose — the plugin
      # replaces it. There is no live source to track any more, so the snapshot
      # in docs/upstream/ IS the record. Verify the snapshot is intact, and if
      # the original happens to still exist, say whether it has drifted since
      # adoption.
      snap="$ROOT/docs/upstream/$name.snapshot"
      if [ ! -f "$snap" ]; then
        printf '  %-22s SNAPSHOT LOST  %s\n' "$name" "docs/upstream/$name.snapshot"
        moved=$((moved + 1)); continue
      fi
      snaphash="$(shasum -a 256 "$snap" | cut -d' ' -f1)"
      if [ "$snaphash" != "$pin" ]; then
        printf '  %-22s SNAPSHOT ALTERED  expected %s got %s\n' \
               "$name" "${pin:0:12}" "${snaphash:0:12}"
        moved=$((moved + 1)); continue
      fi
      path="${source/#\~/$HOME}"
      if [ ! -f "$path" ]; then
        printf '  %-22s archived     %s (source retired, snapshot intact)\n' \
               "$name" "${pin:0:12}"
      elif [ "$(shasum -a 256 "$path" | cut -d' ' -f1)" = "$pin" ]; then
        printf '  %-22s archived     %s (source still present, unchanged)\n' \
               "$name" "${pin:0:12}"
      else
        printf '  %-22s archived     %s (source still present and DRIFTED)\n' \
               "$name" "${pin:0:12}"
        printf '  %-22s   review before deleting: diff -u %s %s\n' \
               "" "docs/upstream/$name.snapshot" "$source"
      fi
      ;;
    file)
      # Unversioned local file still being tracked as a live source.
      path="${source/#\~/$HOME}"
      if [ ! -f "$path" ]; then
        printf '  %-22s GONE         %s\n' "$name" "$source"
        moved=$((moved + 1))
        continue
      fi
      now="$(shasum -a 256 "$path" | cut -d' ' -f1)"
      if [ "$now" = "$pin" ]; then
        printf '  %-22s current      %s\n' "$name" "${pin:0:12}"
      else
        snap="$ROOT/docs/upstream/$name.snapshot"
        printf '  %-22s MOVED        %s -> %s\n' "$name" "${pin:0:12}" "${now:0:12}"
        if [ -f "$snap" ]; then
          printf '  %-22s   diff: diff -u %s %s\n' "" "docs/upstream/$name.snapshot" "$source"
        fi
        moved=$((moved + 1))
      fi
      ;;
    *)
      printf '  %-22s unknown kind %s\n' "$name" "$kind"
      ;;
  esac
done < "$PINS"

echo
if [ "$moved" -eq 0 ]; then
  echo "All pinned sources unchanged."
else
  echo "$moved source(s) moved. Review the diffs, adopt what earns its tokens,"
  echo "then update the pin in UPSTREAM.tsv and refresh docs/upstream/ snapshots."
fi
