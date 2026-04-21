/**
 * @component ThemeToggle
 * @description Bouton de bascule thème clair/sombre. Persistance dans localStorage
 *              (clé "match360-theme"). Application immédiate via classe sur <html>.
 * @access Tous utilisateurs (présent dans la TopBar)
 * @features
 *  - Toggle Sun ↔ Moon
 *  - Persistance localStorage
 *  - Application instantanée (pas de flash au reload via init dans index.html)
 *  - Respect des design tokens HSL (light/dark définis dans index.css)
 * @maintenance
 *  - Tous les composants doivent utiliser les semantic tokens (HSL)
 *  - Aucune couleur hardcodée pour garantir le support des deux modes
 */
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "match360-theme";

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre"}
      title={theme === "dark" ? "Mode clair" : "Mode sombre"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
};