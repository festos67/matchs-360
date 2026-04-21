/**
 * @test setup
 * @description Bootstrap global de l'environnement de test Vitest. Ce fichier est
 *              chargé automatiquement avant chaque suite de tests via l'option
 *              `setupFiles` de `vitest.config.ts`. Il prépare l'environnement
 *              jsdom pour qu'il se comporte comme un vrai navigateur vis-à-vis
 *              du code applicatif (composants UI, hooks responsive, etc.).
 *
 * @access Chargé automatiquement par Vitest (setupFiles dans vitest.config.ts)
 *
 * @initialization Étapes effectuées au démarrage :
 *  1. Import de `@testing-library/jest-dom` → étend l'objet global `expect`
 *     avec les matchers DOM (toBeInTheDocument, toHaveClass, toBeVisible,
 *     toHaveAttribute, toHaveTextContent, etc.).
 *  2. Polyfill de `window.matchMedia` → API absente de jsdom mais utilisée
 *     par le hook `useIsMobile` (src/hooks/use-mobile.tsx) et plusieurs
 *     composants Radix/shadcn (Dialog, Sheet, Sidebar) pour détecter le
 *     breakpoint mobile. Le mock retourne par défaut `matches: false`
 *     (= toujours desktop) pour stabiliser les snapshots.
 *
 * @mocks
 *  - `window.matchMedia` : stub minimal compatible MediaQueryList. Les
 *    listeners (`addListener`, `addEventListener`) sont des no-op : si un
 *    test doit simuler un changement de breakpoint, redéfinir manuellement
 *    `window.matchMedia` dans le `beforeEach` du test concerné.
 *  - Le client Supabase n'est PAS mocké ici (fait par test via `vi.mock`,
 *    voir `src/test/rls-security.test.ts` pour un exemple).
 *
 * @running Lancer les tests en local :
 *  - Tous les tests             : `bun run test` (ou `npx vitest run`)
 *  - Mode watch                 : `bunx vitest`
 *  - Un seul fichier            : `bunx vitest src/test/rls-security.test.ts`
 *  - Filtre par nom             : `bunx vitest -t "RLS — subscriptions"`
 *  - Avec couverture            : `bunx vitest run --coverage`
 *  - Via l'outil Lovable        : utiliser `code--run_tests` (auto-détection)
 *
 * @maintenance
 *  - Ajouter un polyfill : étendre `window` ici (ex: ResizeObserver,
 *    IntersectionObserver, scrollTo) si un composant UI le requiert.
 *  - Configuration Vitest    : vitest.config.ts (jsdom, alias `@/`)
 *  - Types globaux Vitest    : tsconfig.app.json → `"types": ["vitest/globals"]`
 *  - Convention de nommage   : `*.test.ts(x)` ou `*.spec.ts(x)`
 *  - Documentation associée  : /mnt/documents/rls-security-tests-guide.md
 */
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});
