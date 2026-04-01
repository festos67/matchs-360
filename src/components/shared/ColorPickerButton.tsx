import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import { Check } from "lucide-react";

interface ColorPickerButtonProps {
  value: string;
  onChange: (color: string) => void;
  id?: string;
}

export function ColorPickerButton({ value, onChange, id }: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tempColor, setTempColor] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleValidate = () => {
    onChange(tempColor);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempColor(e.target.value);
    if (!open) setOpen(true);
  };

  const handleClick = () => {
    setTempColor(value);
    inputRef.current?.click();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-10 h-10">
          <input
            ref={inputRef}
            type="color"
            id={id}
            value={tempColor}
            onChange={handleInputChange}
            onInput={() => { if (!open) setOpen(true); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="w-10 h-10 rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow pointer-events-none"
            style={{ backgroundColor: value }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-3 flex flex-col items-center gap-2" align="start" side="bottom">
        <p className="text-xs text-muted-foreground font-medium self-start">Sélectionner une couleur</p>
        <div
          className="w-14 h-14 rounded-lg border border-border"
          style={{ backgroundColor: tempColor }}
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
