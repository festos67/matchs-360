import { useState } from "react";
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

  const handleValidate = () => {
    onChange(tempColor);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      if (isOpen) setTempColor(value);
      setOpen(isOpen);
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-10 h-10 rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 flex flex-col items-center gap-3" align="start" side="bottom">
        <p className="text-xs text-muted-foreground font-medium self-start">Sélectionner une couleur</p>
        <input
          type="color"
          id={id}
          value={tempColor}
          onChange={(e) => setTempColor(e.target.value)}
          className="w-full h-32 cursor-pointer border-0 p-0 bg-transparent"
        />
        <div className="w-full pt-3 border-t border-border">
          <Button size="sm" onClick={handleValidate} className="gap-1.5 w-full">
            <Check className="w-4 h-4" />
            Valider
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
