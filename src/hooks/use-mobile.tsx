/**
 * @hook useIsMobile
 * @description Hook réactif détectant si l'écran courant est en dessous du
 *              breakpoint mobile (768px). Utilisé pour adapter rendus et
 *              comportements (ex : sidebar Sheet vs fixe, layouts responsive).
 * @returns boolean — true si window.innerWidth < 768
 * @features
 *  - matchMedia listener pour mise à jour temps réel
 *  - Cleanup automatique au démontage
 *  - SSR-safe (initialisé à undefined puis hydraté côté client)
 * @maintenance
 *  - Breakpoint aligné sur Tailwind `md` (768px)
 *  - Stratégie responsive : mem://navigation/mobile-responsiveness
 */
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
