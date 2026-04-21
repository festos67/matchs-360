/**
 * @entry main.tsx
 * @description Point d'entrée Vite/React. Applique le thème persisté (light/dark)
 *              AVANT le render pour éviter le flash de couleur (FOUC), puis
 *              monte l'application racine <App /> via createRoot.
 * @features
 *  - Lecture localStorage "match360-theme" → priorité utilisateur
 *  - Fallback sur prefers-color-scheme système
 *  - Application immédiate de la classe `dark` sur <html>
 *  - Import global de index.css (Tailwind + tokens HSL)
 * @maintenance
 *  - Ne JAMAIS retirer le bloc IIFE thème (provoque un flash blanc)
 *  - Toggle utilisateur : src/components/shared/ThemeToggle.tsx
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply persisted theme before render to avoid flash
(() => {
  try {
    const stored = localStorage.getItem("match360-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch {}
})();

createRoot(document.getElementById("root")!).render(<App />);
