/**
 * @component MobileSidebar
 * @description Tiroir de navigation pour les écrans mobiles (< md). Affiche
 *              un bouton hamburger dans la TopBar qui ouvre un Sheet shadcn
 *              latéral contenant le même SidebarContent que la version desktop.
 * @access Tous rôles authentifiés (visible uniquement sur mobile)
 * @features
 *  - Bouton trigger caché en md+ (className="md:hidden")
 *  - Sheet shadcn (side="left", w-64) avec fond sidebar cohérent
 *  - VisuallyHidden SheetTitle pour accessibilité (a11y screen readers)
 *  - Fermeture automatique au clic sur un item de navigation (onNavigate)
 * @maintenance
 *  - Stratégie responsive : mem://navigation/mobile-responsiveness
 *  - SidebarContent partagé : src/components/layout/Sidebar.tsx
 */
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { SidebarContent } from "./Sidebar";

export const MobileSidebar = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
          <VisuallyHidden>
            <SheetTitle>Menu de navigation</SheetTitle>
          </VisuallyHidden>
          <div className="flex flex-col h-full">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
