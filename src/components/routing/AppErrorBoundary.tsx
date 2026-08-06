/**
 * @component AppErrorBoundary
 * @description Filet de sécurité global autour du routeur. Deux rôles :
 *
 *  1. ÉCHEC DE CHARGEMENT D'UN CHUNK (cause n°1 des pages blanches)
 *     L'application découpe ~40 pages en imports dynamiques. Les fichiers
 *     produits par Vite sont hashés : à chaque déploiement, les anciens sont
 *     supprimés du serveur et remplacés. Un utilisateur dont l'onglet est resté
 *     ouvert conserve un index.html qui référence les ANCIENS hashs ; au premier
 *     clic sur un menu, le navigateur demande un fichier qui n'existe plus
 *     (404), l'import rejette, et sans garde-fou React démonte tout l'arbre :
 *     écran blanc jusqu'à un rechargement manuel.
 *     -> On détecte ce cas précis et on recharge automatiquement la page, ce qui
 *        récupère l'index.html à jour et ses nouveaux hashs.
 *
 *  2. TOUTE AUTRE ERREUR DE RENDU
 *     -> Écran d'erreur lisible avec action de rechargement, plutôt qu'une page
 *        blanche muette.
 *
 * GARDE ANTI-BOUCLE : le rechargement automatique n'a lieu qu'UNE fois par
 * session de navigation (drapeau en sessionStorage). Si l'erreur persiste après
 * ce rechargement, elle n'était pas due à un chunk obsolète : on affiche alors
 * l'écran d'erreur au lieu de recharger indéfiniment.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RELOAD_FLAG = "matchs360_chunk_reload";

/**
 * Reconnaît un échec de chargement de module dynamique. Les navigateurs ne
 * normalisent pas ce message, d'où la liste de variantes.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name} ${error.message}`
        : "";

  return [
    "Failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "Importing a module script failed",
    "Unable to preload CSS",
    "ChunkLoadError",
  ].some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    // Chunk obsolète : on tente le rechargement automatique, une seule fois.
    if (isChunkLoadError(error)) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // sessionStorage indisponible (mode privé strict) : on ne recharge pas
        // automatiquement pour éviter tout risque de boucle.
        alreadyReloaded = true;
      }

      if (!alreadyReloaded) {
        window.location.reload();
        // L'état importe peu : la page est en train d'être rechargée.
        return { hasError: true, message: "" };
      }
    }

    return {
      hasError: true,
      message: error?.message ?? "Erreur inattendue",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info.componentStack);
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="mb-3 font-display text-xl font-bold">
            Une erreur est survenue
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            La page n'a pas pu s'afficher. Rechargez pour reprendre là où vous
            en étiez.
          </p>
          <Button onClick={this.handleReload} className="gap-2">
            <RotateCw className="h-4 w-4" />
            Recharger la page
          </Button>
        </div>
      </div>
    );
  }
}

/**
 * Vite émet `vite:preloadError` quand le préchargement d'un chunk échoue —
 * souvent AVANT que l'erreur ne remonte jusqu'à un composant. On intercepte ici
 * pour recharger au plus tôt, avec le même garde anti-boucle.
 */
export function installChunkErrorRecovery() {
  window.addEventListener("vite:preloadError", (event) => {
    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
      if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      alreadyReloaded = true;
    }
    if (!alreadyReloaded) {
      event.preventDefault();
      window.location.reload();
    }
  });

  // Après une navigation réussie, on réarme le mécanisme pour le prochain
  // déploiement : sans cela, un seul rechargement serait possible par onglet.
  window.addEventListener("load", () => {
    setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* ignore */
      }
    }, 10_000);
  });
}
