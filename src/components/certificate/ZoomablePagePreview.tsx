/**
 * @component ZoomablePagePreview
 * @description Visualiseur d'une page imprimable de taille fixe (ex. A4
 *              paysage) dans une zone qui s'adapte à l'écran.
 *
 *  - À l'ouverture et au redimensionnement : page entière visible (« Page
 *    entière »), centrée.
 *  - Zoom : boutons − / +, pincement à deux doigts (téléphone, tablette),
 *    Ctrl + molette (ordinateur), double-clic pour basculer page entière / 100 %.
 *  - Déplacement : défilement horizontal et vertical natif dès que la page
 *    dépasse la zone (doigt, molette, barres de défilement).
 *
 * La page est réduite par transform, mais son conteneur prend la taille
 * RÉDUITE : les barres de défilement correspondent à ce qui est affiché (pas
 * d'espace vide ni de débordement fantôme). L'élément enfant n'est pas
 * modifié : l'impression (react-to-print sur l'enfant) reste identique.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const MM_TO_PX = 96 / 25.4;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const PADDING = 16;

const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export function ZoomablePagePreview({
  widthMm,
  heightMm,
  children,
}: {
  widthMm: number;
  heightMm: number;
  children: ReactNode;
}) {
  const pageW = widthMm * MM_TO_PX;
  const pageH = heightMm * MM_TO_PX;

  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  // null = « page entière » (suit la taille de l'écran) ; sinon zoom choisi.
  const [zoom, setZoom] = useState<number | null>(null);
  const scale = zoom ?? fitScale;

  // Point de la page à garder au centre après un changement de zoom.
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

  // Page entière : dépend de la place disponible.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - PADDING * 2;
      const h = el.clientHeight - PADDING * 2;
      if (w <= 0 || h <= 0) return;
      setFitScale(clamp(Math.min(w / pageW, h / pageH)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageW, pageH]);

  const applyZoom = useCallback(
    (next: number | null) => {
      const el = viewportRef.current;
      if (el) {
        // Mémorise le centre visible, en coordonnées de page (0..1).
        const cx = (el.scrollLeft + el.clientWidth / 2 - PADDING) / (pageW * scale);
        const cy = (el.scrollTop + el.clientHeight / 2 - PADDING) / (pageH * scale);
        anchorRef.current = { x: Math.min(1, Math.max(0, cx)), y: Math.min(1, Math.max(0, cy)) };
      }
      setZoom(next === null ? null : clamp(next));
    },
    [pageW, pageH, scale],
  );

  // Après le changement de taille : recentre sur le point mémorisé.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    anchorRef.current = null;
    el.scrollLeft = PADDING + anchor.x * pageW * scale - el.clientWidth / 2;
    el.scrollTop = PADDING + anchor.y * pageH * scale - el.clientHeight / 2;
  }, [scale, pageW, pageH]);

  // Ctrl + molette (ordinateur) et pincement à deux doigts (écran tactile).
  // Écouteurs non passifs : il faut empêcher le zoom de toute la page.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoom(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };

    let pinch: { distance: number; scale: number } | null = null;
    const distanceOf = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { distance: distanceOf(e.touches), scale };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      applyZoom(pinch.scale * (distanceOf(e.touches) / pinch.distance));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyZoom, scale]);

  const percent = Math.round(scale * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-center gap-1.5 border-b bg-background px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => applyZoom(scale / ZOOM_STEP)}
          disabled={scale <= MIN_ZOOM}
          aria-label="Réduire"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-14 text-center text-sm tabular-nums" aria-live="polite">
          {percent} %
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => applyZoom(scale * ZOOM_STEP)}
          disabled={scale >= MAX_ZOOM}
          aria-label="Agrandir"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={zoom === null ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => applyZoom(null)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Page entière
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => applyZoom(1)}>
          100 %
        </Button>
        <span className="hidden text-xs text-muted-foreground md:inline">
          Ctrl + molette pour zoomer
        </span>
        <span className="text-xs text-muted-foreground md:hidden">Pincez pour zoomer</span>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/40"
        // Le navigateur ne zoome plus toute la page ici : le pincement est géré
        // par le visualiseur ; le glissement à un doigt fait défiler.
        style={{ touchAction: "pan-x pan-y" }}
        onDoubleClick={() => applyZoom(zoom === null ? 1 : null)}
      >
        <div
          className="mx-auto"
          style={{ width: pageW * scale + PADDING * 2, height: pageH * scale + PADDING * 2, padding: PADDING }}
        >
          <div className="relative bg-white shadow-lg" style={{ width: pageW * scale, height: pageH * scale }}>
            <div
              className="absolute left-0 top-0"
              style={{ width: pageW, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
