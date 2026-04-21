/**
 * @component PhotoCropModal
 * @description Modale de recadrage circulaire d'une photo (react-easy-crop).
 *              Étape obligatoire avant upload pour garantir un format avatar
 *              cohérent (rond, JPEG qualité 92).
 * @props
 *  - imageSrc: string — image source à recadrer
 *  - onCropComplete: (blob: Blob) => void
 *  - onClose: () => void
 * @features
 *  - Cropper avec aspect 1:1 (carré → recadrage circulaire)
 *  - Zoom slider et drag pour ajustement
 *  - Génération blob JPEG qualité 92
 *  - useCallback pour stabilité de la callback onCropComplete
 * @maintenance
 *  - Workflow média : mem://technical/media-processing-workflow
 *  - Cache-busting timestamp sur URL résultante
 *  - Utilisé dans Profile, EditPlayer, EditCoach, etc.
 */
import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Check, X } from "lucide-react";

interface PhotoCropModalProps {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/jpeg", 0.92);
  });
}

export const PhotoCropModal = ({ open, imageSrc, onClose, onCropComplete }: PhotoCropModalProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropCompleteHandler = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(blob);
    } catch (e) {
      console.error("Crop error:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recadrer la photo</DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[350px] bg-muted rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteHandler}
          />
        </div>

        <div className="flex items-center gap-3 px-2">
          <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={(v) => setZoom(v[0])}
            className="flex-1"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            <Check className="w-4 h-4 mr-2" />
            {saving ? "Recadrage..." : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
