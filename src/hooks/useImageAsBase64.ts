import { useEffect, useState } from "react";

/**
 * Charge une image distante et la convertit en data URL base64.
 * Indispensable pour les exports PDF (html2canvas/jsPDF) afin d'éviter
 * les problèmes de CORS, de tainted canvas et de cache navigateur.
 * Retourne null tant que le chargement n'est pas terminé ou si l'URL est vide.
 */
export function useImageAsBase64(url: string | null | undefined): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled && typeof reader.result === "string") {
            setDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("useImageAsBase64: failed to load", url, err);
        if (!cancelled) setDataUrl(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return dataUrl;
}

/**
 * Variante batch : charge plusieurs URLs et retourne un map url -> dataUrl.
 * Les entrées falsy sont ignorées.
 */
export function useImagesAsBase64(urls: Array<string | null | undefined>): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = urls.filter(Boolean).join("|");

  useEffect(() => {
    let cancelled = false;
    const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
    if (unique.length === 0) {
      setMap({});
      return;
    }

    Promise.all(
      unique.map(async (u) => {
        try {
          const res = await fetch(u, { cache: "force-cache" });
          if (!res.ok) return [u, null] as const;
          const blob = await res.blob();
          const data = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          return [u, data] as const;
        } catch {
          return [u, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [u, data] of entries) {
        if (data) next[u] = data;
      }
      setMap(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}