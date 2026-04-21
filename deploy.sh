#!/usr/bin/env bash
# Copy the module source into the live Foundry data directory so the running
# server picks up changes. Mirrors the pattern used by other VTTools modules.
#
# Run from the module root: `bash deploy.sh`
#
# Assumes the standard VTTools layout:
#   R:/Foundry/Modules/gmants-roleplayr-integration/   (this repo)
#   R:/Foundry/Data/modules/gmants-roleplayr-integration/ (where Foundry loads from)

set -euo pipefail

MODULE_ID="gmants-roleplayr-integration"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="R:/Foundry/Data/modules/${MODULE_ID}"

if [ ! -d "$(dirname "$DEST")" ]; then
  echo "Foundry Data/modules directory not found at $(dirname "$DEST")"
  echo "Edit DEST in deploy.sh if your layout differs."
  exit 1
fi

echo "Deploying ${MODULE_ID}..."
echo "  src:  ${SRC}"
echo "  dest: ${DEST}"

mkdir -p "${DEST}"

# Mirror the core files — skip node_modules, docs, .git, etc.
for item in module.json scripts styles templates lang assets images LICENSE README.md CHANGELOG.md CLAUDE.md; do
  if [ -e "${SRC}/${item}" ]; then
    rm -rf "${DEST}/${item}"
    cp -R "${SRC}/${item}" "${DEST}/${item}"
    echo "  ✓ ${item}"
  fi
done

# Packs — copy compiled LevelDB data only, skip _source/.
# Never run this while a world is running — Foundry holds exclusive LevelDB
# locks and mixing old/new files corrupts the pack.
if [ -d "${SRC}/packs" ]; then
  for pack in gmants-roleplayr-macros; do
    pack_src="${SRC}/packs/${pack}"
    pack_dest="${DEST}/packs/${pack}"
    if [ -d "${pack_src}" ]; then
      rm -rf "${pack_dest}"
      mkdir -p "${pack_dest}"
      find "${pack_src}" -maxdepth 1 -type f \
        \( -name "*.ldb" -o -name "CURRENT" -o -name "MANIFEST-*" -o -name "*.log" -o -name "LOG" -o -name "LOG.old" -o -name "LOCK" \) \
        -exec cp {} "${pack_dest}/" \;
      echo "  ✓ packs/${pack}"
    fi
  done
fi

echo "Done. Reload your Foundry world (F5) or Return to Setup + relaunch to pick up ESM changes."
