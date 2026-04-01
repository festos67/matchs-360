import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Pipette } from "lucide-react";
import { RgbColorPicker, type RgbColor } from "react-colorful";
import "react-colorful/dist/index.css";

interface ColorPickerButtonProps {
  value: string;
  onChange: (color: string) => void;
  id?: string;
}

export function ColorPickerButton({ value, onChange, id }: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tempRgb, setTempRgb] = useState<RgbColor>(() => hexToRgb(value));

  const tempColor = rgbToHex(tempRgb);

  const handleValidate = () => {
    onChange(tempColor);
    setOpen(false);
  };

  const handleChannelChange = (channel: keyof RgbColor, rawValue: string) => {
    const parsedValue = Number.parseInt(rawValue, 10);
    setTempRgb((prev) => ({
      ...prev,
      [channel]: Number.isNaN(parsedValue) ? 0 : clampChannel(parsedValue),
    }));
  };

  const handlePickFromScreen = async () => {
    const EyeDropperConstructor = (
      window as Window & {
        EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
      }
    ).EyeDropper;

    if (!EyeDropperConstructor) return;

    try {
      const eyeDropper = new EyeDropperConstructor();
      const result = await eyeDropper.open();
      setTempRgb(hexToRgb(result.sRGBHex));
    } catch {
      // Annulation utilisateur : aucune action.
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setTempRgb(hexToRgb(value));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label="Sélectionner une couleur"
          className="w-10 h-10 rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[290px] p-3" align="start" side="bottom">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium">Sélectionner une couleur</p>
          <div className="rounded-md border border-border p-2 bg-background/60">
            <RgbColorPicker
              color={tempRgb}
              onChange={setTempRgb}
              className="!w-full !h-[188px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handlePickFromScreen}
              aria-label="Utiliser la pipette"
            >
              <Pipette className="w-4 h-4" />
            </Button>
            <div
              className="h-9 w-9 rounded-full border border-border"
              style={{ backgroundColor: tempColor }}
            />
            <p className="ml-auto text-xs text-muted-foreground font-mono uppercase">{tempColor}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">R</label>
              <Input
                type="number"
                min={0}
                max={255}
                value={tempRgb.r}
                onChange={(e) => handleChannelChange("r", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">G</label>
              <Input
                type="number"
                min={0}
                max={255}
                value={tempRgb.g}
                onChange={(e) => handleChannelChange("g", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">B</label>
              <Input
                type="number"
                min={0}
                max={255}
                value={tempRgb.b}
                onChange={(e) => handleChannelChange("b", e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>
        <div className="w-full pt-3 mt-1 border-t border-border">
          <Button type="button" size="sm" onClick={handleValidate} className="gap-1.5 w-full">
            <Check className="w-4 h-4" />
            Valider
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, value));
}

function rgbToHex({ r, g, b }: RgbColor) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number) {
  return clampChannel(value).toString(16).padStart(2, "0");
}

function hexToRgb(hex: string): RgbColor {
  const cleanHex = hex.trim().replace("#", "");
  const normalizedHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((char) => char + char)
          .join("")
      : cleanHex;

  if (!/^[\da-fA-F]{6}$/.test(normalizedHex)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16),
    g: Number.parseInt(normalizedHex.slice(2, 4), 16),
    b: Number.parseInt(normalizedHex.slice(4, 6), 16),
  };
}
