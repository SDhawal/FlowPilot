# ADR-0001: Technology stack and hosting

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dhawal Sharma

## Context
FlowPilot AI must run on iOS, Android and the web from one team (one developer), use AI to turn goals into plans, and cost nothing to run as a portfolio project. It should demonstrate senior-level architecture.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **React Native + Expo (TypeScript)** | One codebase for iOS/Android/Web via Expo Router; TS skills transfer to web; large ecosystem; free local + limited free cloud builds | Web output less "native web" than a pure React app; some libraries native-only |
| Flutter | Pixel-consistent UI, strong tooling | New language (Dart); web renders to canvas (weaker accessibility/SEO feel) |
| Kotlin Multiplatform / Compose MP | Native performance, shared logic | Weakest web story; iOS UI may need SwiftUI; slowest path for a solo dev |

Backend: ASP.NET Core chosen for strong typing, built-in rate limiting, Identity, OpenAPI and EF Core; aligns with existing .NET work.

## Decision
- Client: **Expo + React Native + TypeScript**, Expo Router, TanStack Query, Zustand, React Hook Form + zod.
- API: **ASP.NET Core (.NET LTS)**, Clean Architecture, EF Core, **PostgreSQL**, ASP.NET Core Identity + JWT.
- AI: **Gemini API (free tier)** behind an `IAiProvider` abstraction; never called from the client.
- Contract: OpenAPI document generated at build → typed TS client (openapi-typescript).
- Hosting (free tiers): API on **Render** (Docker), DB on **Neon**, web on **Cloudflare Pages**, CI on **GitHub Actions**.
- App-store publishing deferred (Apple US$99/yr, Google Play US$25). Demo via web link, Android APK, Expo Go.

## Consequences
- + Single language on the client across three platforms; end-to-end typed API.
- + $0 running cost.
- − Cold starts: Render and Neon sleep when idle (~30–60 s first request). The UI must show a "waking up" state.
- − Gemini free-tier prompts may be used by Google to improve products → demo data only; warn users in-app.
- − Free tiers change; everything is containerized and configured via env vars to allow moving hosts quickly.
