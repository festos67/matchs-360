/**
 * @test setup
 * @description Bootstrap global de l'environnement de test Vitest. Charge les
 *              matchers jest-dom (toBeInTheDocument, toHaveClass, ...) et
 *              polyfille les API navigateur absentes de jsdom (matchMedia,
 *              ResizeObserver, IntersectionObserver le cas échéant).
 * @access Chargé automatiquement par vitest.config.ts (setupFiles)
 * @features
 *  - Mock de window.matchMedia (requis par useIsMobile et certains composants UI)
 *  - Extension globale d'expect avec les matchers DOM
 * @maintenance
 *  - Pour ajouter un polyfill : étendre window dans ce fichier
 *  - Configuration Vitest : vitest.config.ts
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
