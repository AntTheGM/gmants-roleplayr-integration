# Contributing

Thanks for your interest in contributing! Here's how to get started.

## Reporting Bugs

Use the [Bug Report](../../issues/new?template=bug-report.yml) template. Include your Foundry version, system version, module version, and steps to reproduce. **Redact API keys before pasting console output.**

## Suggesting Features

Use the [Feature Request](../../issues/new?template=feature-request.yml) template. Describe the use case — knowing *why* helps prioritize.

## Pull Requests

1. **Fork** the repo and create a branch from `main`
2. **Make your changes** — this is a vanilla ES module project with no build step
3. **Test locally** by copying the module folder to your Foundry `Data/modules/gmants-roleplayr-integration/` directory and reloading. A real Roleplayr API key is needed for end-to-end testing of the sync paths.
4. **Open a PR** using the provided template

### Code Style

- Vanilla JavaScript ES modules (no TypeScript, no bundler)
- `const` over `let`, never `var`
- Strict equality (`===`)
- Curly braces on all control flow
- CSS classes prefixed with the module ID
- Follow the adapter pattern in `scripts/adapters/` for any new system support

### API Contract

Roleplayr's public API lives at `/api/v1/*`. This module targets that version.

- **Do not** send unknown fields expecting the server to accept them.
- **Ignore** unknown response fields. Never use strict schemas that reject extra keys.
- **Handle** 429 rate limits and 409 opt-in rejections gracefully (see `RoleplayrApi._fetch`).

### What We're Looking For

- **Bug fixes**: always welcome
- **New system adapters**: open an issue to discuss the system and which fields map where
- **New features**: please open an issue first to discuss

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
