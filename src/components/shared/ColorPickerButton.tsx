import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";

interface ColorPickerButtonProps {
  value: string;
  onChange: (color: string) => void;
  id?: string;
}

export function ColorPickerButton({ value, onChange, id }: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tempColor, setTempColor] = useState(value);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setTempColor(value);
    setOpen(isOpen);
  };

  // Auto-click the color input when popover opens
  useEffect(() => {
    if (open && colorInputRef.current) {
      setTimeout(() => colorInputRef.current?.click(), 100);
    }
  }, [open]);

  const handleValidate = () => {
    onChange(tempColor);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          className="w-10 h-10 rounded-lg border border-border cursor-pointer shadow-sm hover:shadow-md transition-shadow"
          style={{ backgroundColor: value }}
          aria-label="Choisir une couleur"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 flex flex-col items-center gap-2" align="start" side="bottom">
        <p className="text-xs text-muted-foreground font-medium self-start">Sélectionner une couleur</p>
        <input
          ref={colorInputRef}
          type="color"
          value={tempColor}
          onChange={(e) => setTempColor(e.target.value)}
          className="w-16 h-16 rounded-lg border-none cursor-pointer"
        />
        <div className="w-full pt-3 mt-1 border-t border-border">
          <Button size="sm" onClick={handleValidate} className="gap-1.5 w-full">
            <Check className="w-4 h-4" />
            Valider
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
