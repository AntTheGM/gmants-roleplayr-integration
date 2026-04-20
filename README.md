# Roleplayr Integration

![License](https://img.shields.io/github/license/AntTheGM/gmants-roleplayr-integration)
![Foundry](https://img.shields.io/badge/Foundry-v13-informational)
![Release](https://img.shields.io/github/v/release/AntTheGM/gmants-roleplayr-integration)
![Downloads](https://img.shields.io/github/downloads/AntTheGM/gmants-roleplayr-integration/total)

> *VTTools by GM Ant* — bridge your Foundry VTT world with your [Roleplayr](https://www.roleplayr.net) campaign.

Paste an API key from your Roleplayr campaign settings, and this module:

- **Imports** characters, adversaries, items, locations, and events from Roleplayr as Foundry Actors/Items.
- **Syncs actor changes back** — HP, XP, and ability scores on imported actors write back to Roleplayr automatically (debounced).
- **Streams combat state live** — the active combatant, initiative order, party HP, and current scene are pushed to the Roleplayr Player Portal in real time so players watching from a browser see exactly what's happening at the table.

## Installation

1. In Foundry's **Setup → Configuration → Add-on Modules**, click **Install Module**.
2. Paste the manifest URL:
   ```
   https://github.com/AntTheGM/gmants-roleplayr-integration/releases/latest/download/module.json
   ```
3. Enable the module in your world.

## Setup

1. In **Roleplayr**, open your campaign settings and generate an API key under **Foundry VTT Integration**. Copy the key (it's shown once).
2. In Foundry, open **Game Settings → Configure Settings → Module Settings → Roleplayr Integration → Configure Roleplayr**.
3. Paste the API key, click **Test connection**, and save.
4. (Optional) In the Roleplayr campaign settings, toggle **Live Foundry state → Player Portal** on to enable live combat streaming.

## Usage

### Importing entities

From the **Game Settings** sidebar, click **Import from Roleplayr**. Switch between entity types in the tab bar, click **Import** on the row you want.

Imported actors are flagged with the source Roleplayr entity ID — that's what makes the sync-back path know which Roleplayr entity to PATCH.

### Syncing actor changes

Any change to HP, max HP, or XP on an imported actor is debounced (2 seconds) and sent to Roleplayr as an element-level PATCH. Free-standing actors (ones not created via the import dialog) are left alone.

### Live combat state

With the campaign's Foundry sync toggle on, the module pushes combat state to `PUT /api/v1/foundry/state` whenever:

- Combat starts
- A turn or round advances
- The scene changes (for the `current_scene` field)

Pushes are rate-limited client-side to 1/sec to match the server's enforcement.

## Configuration

Under **Module Settings → Roleplayr Integration**:

| Setting | Default | What it does |
|---|---|---|
| Configure Roleplayr | — | Paste/test/save your API key |
| Sync Actor Changes to Roleplayr | ✓ | Toggle the actor sync-back path |
| Stream Combat State to Player Portal | ✓ | Toggle the live combat push |

## Privacy & security

- The API key is stored as a **world-scoped** setting, visible to the GM only.
- All calls go over HTTPS. Bearer auth; no cookies.
- The module never sends free-standing Foundry actors to Roleplayr — only ones imported from Roleplayr (identified by a module flag).

## Compatibility

- **FoundryVTT:** v13+
- **Systems:** D&D 5e (`dnd5e`) and Pathfinder 2e (`pf2e`). Other systems fall back to the 5e mapping (HP/level/abilities at well-known paths).

## Contributing

Bug reports and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

Found a bug or have a feature idea? File it on [GitHub Issues](https://github.com/AntTheGM/gmants-roleplayr-integration/issues).

For Roleplayr service questions (API keys, campaign settings, Player Portal), visit [roleplayr.net](https://www.roleplayr.net).

## License

[MIT](LICENSE) © GM Ant

## Links

- **Roleplayr:** https://www.roleplayr.net
- **API docs:** https://www.roleplayr.net/api/v1/docs
- **Other VTTools modules:** https://roleplayr.com/gmant

---

*Part of the VTTools suite by GM Ant.*
