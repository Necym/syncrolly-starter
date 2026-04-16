# Syncrolly Starter

A mobile-first monorepo starter for Syncrolly.

## Structure
- `apps/mobile` - Expo React Native app
- `apps/web` - Next.js app
- `packages/core` - shared domain types and mock data
- `packages/config` - shared product config
- `docs` - product, scope, architecture notes
- `.codex` - project-specific Codex guidance

## First steps
1. Open this folder in VS Code / Codex.
2. Run `pnpm install` at the repo root.
3. Start mobile with `pnpm dev:mobile`.
4. Start web later with `pnpm dev:web`.

## Suggested first Codex prompt
Create authentication screens and a local mocked auth flow for creators and supporters in the Expo app, keeping the web app untouched.
