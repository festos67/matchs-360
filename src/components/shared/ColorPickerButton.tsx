import { useState, useRef } from "react";
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

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setTempColor(value);
    setOpen(isOpen);
  };

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
      <PopoverContent className="w-auto p-3 flex flex-col items-center gap-3" align="start">
        <input
          type="color"
          value={tempColor}
          onChange={(e) => setTempColor(e.target.value)}
          className="w-16 h-16 rounded-lg border-none cursor-pointer"
        />
        <Button size="sm" onClick={handleValidate} className="gap-1.5 w-full">
          <Check className="w-4 h-4" />
          Valider
        </Button>
      </PopoverContent>
    </Popover>
  );
}
