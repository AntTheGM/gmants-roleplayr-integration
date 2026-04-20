# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-04-18

Initial release. Connects Foundry VTT to a Roleplayr campaign via the `/api/v1/*` public API.

### Added

- Config dialog: paste API key, test connection via `GET /api/v1/me`, store binding.
- Import dialog: browse entities by type (character, adversary, item, location, event) and create Foundry Actors/Items with per-system mapping (dnd5e, pf2e).
- Actor sync: `updateActor` hook with 2-second debounce writes HP / max HP / XP back to Roleplayr via `PATCH /api/v1/entities/:id`.
- Combat sync: `combatStart` / `combatRound` / `combatTurn` / `updateCombat` hooks stream the tracker, party HP, and current scene to `PUT /api/v1/foundry/state` (rate-limited client-side to 1/sec).
- Settings: toggles to disable actor sync and combat sync independently.
- Graceful handling of 409 `CAMPAIGN_SYNC_DISABLED` and 429 `RATE_LIMITED` responses (silent after one-shot warning).

[Unreleased]: https://github.com/AntTheGM/gmants-roleplayr-integration/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/AntTheGM/gmants-roleplayr-integration/releases/tag/v1.0.0
