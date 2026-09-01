# Third-Party Source References

Work Management v1.22.0 and subsequent architecture releases were restructured using architectural concepts from source packages supplied by the project owner:

- `monday-sdk-js` — MIT License. The Work Management runtime client adapts the general `listen/get/set/execute` API shape and listener/service-boundary concept. It does not include monday.com API endpoints, OAuth behavior, analytics, or background tracking.
- `monday-ui-style` — MIT License. The Work Management CSS foundation adapts the concept of separating theme-independent core tokens from theme-specific semantic mappings. Work Management retains its own token names, palette, component styles, and visual identity.

No monday.com trademarks, hosted services, credentials, or proprietary backend APIs are required by Work Management.

Work Management v1.35.0 adds no new third-party runtime dependency. The query, repository, capability, diagnostic, error-boundary, and overlay abstractions in this release are project-owned ES modules. Future library candidates documented in the architecture evaluation are recommendations only and are not bundled in v1.35.0.

Work Management v1.36.0 introduces **Vite 8.2.2** as a development/build dependency under the MIT License. Vite is not an application runtime framework; it provides the development server and production bundling pipeline. The production build can emit `.vite/licenses.md` through Vite's `build.license` option for bundled dependency notices. No additional application-runtime framework is introduced by the v1.36.0 migration.
## TypeScript

Work Management v1.37.0 adds **TypeScript 5.8.3** as a development/type-checking dependency under the Apache License 2.0. TypeScript is used incrementally for compile-time contracts and Vite-compatible source migration; it does not add an application runtime framework.

