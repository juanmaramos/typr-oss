import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@typr/ui/components/ui/dialog";
import { Kbd, KbdKey } from "@typr/ui/components/ui/kbd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@typr/ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@typr/ui/components/ui/tabs";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { KeyboardIcon, XIcon } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { getShortcutsByCategory, type ShortcutItem, shortcutsData } from "@/data/shortcuts";
import { parseShortcut } from "@/utils/keyboard-shortcuts";

interface ShortcutsContextType {
  isOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextType | null>(null);

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openShortcuts = () => setIsOpen(true);
  const closeShortcuts = () => setIsOpen(false);

  // Register the Cmd/Ctrl+0 shortcut globally
  useHotkeys(
    "mod+0",
    (event) => {
      event.preventDefault();
      openShortcuts();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <ShortcutsContext.Provider value={{ isOpen, openShortcuts, closeShortcuts }}>
      {children}
      <ShortcutsWindow open={isOpen} onOpenChange={setIsOpen} />
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts() {
  const context = useContext(ShortcutsContext);
  if (!context) {
    // During HMR (hot module reload) in development, the provider might not be ready yet
    // Return a safe fallback instead of throwing to prevent crashes
    console.warn("useShortcuts called outside ShortcutsProvider - returning fallback");
    return {
      isOpen: false,
      openShortcuts: () => console.warn("ShortcutsProvider not available"),
      closeShortcuts: () => console.warn("ShortcutsProvider not available"),
    };
  }
  return context;
}

interface ShortcutsWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutsWindow({ open, onOpenChange }: ShortcutsWindowProps) {
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });

  const shortcutsByCategory = getShortcutsByCategory();
  const categories = Object.keys(shortcutsByCategory);
  const totalCount = shortcutsData.length;

  const getShortcutDisplay = (shortcut: ShortcutItem) => {
    return osType.data === "macos" ? shortcut.macKey : shortcut.windowsKey;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <KeyboardIcon className="size-5" />
            <DialogTitle>
              <Trans>Keyboard Shortcuts</Trans>
            </DialogTitle>
            <Badge variant="secondary" className="text-xs">
              <Trans>{totalCount} shortcuts</Trans>
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="size-6"
          >
            <XIcon className="size-4" />
          </Button>
        </DialogHeader>

        <div className="overflow-y-auto">
          <Tabs defaultValue={categories[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              {categories.map((category) => (
                <TabsTrigger key={category} value={category} className="text-xs">
                  <Trans id={category}>{category}</Trans>
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => (
              <TabsContent key={category} value={category}>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[400px]">
                          <Trans>Action</Trans>
                        </TableHead>
                        <TableHead className="w-[200px]">
                          <Trans>Shortcut</Trans>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shortcutsByCategory[category].map((shortcut) => (
                        <TableRow key={shortcut.id}>
                          <TableCell className="font-medium">
                            <Trans id={shortcut.description}>{shortcut.description}</Trans>
                          </TableCell>
                          <TableCell>
                            <ShortcutBadge shortcut={getShortcutDisplay(shortcut)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <p className="mb-2 font-medium">
              <Trans>Tips:</Trans>
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <Trans>Press Cmd+0 (Ctrl+0 on Windows/Linux) anytime to open this window</Trans>
              </li>
              <li>
                <Trans>Most shortcuts work even when typing in text fields</Trans>
              </li>
              <li>
                <Trans>Some shortcuts may vary based on your operating system</Trans>
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  const keys = parseShortcut(shortcut);

  return (
    <Kbd separator={<span className="text-muted-foreground/50">+</span>}>
      {keys.map((key, index) => <KbdKey key={index}>{key}</KbdKey>)}
    </Kbd>
  );
}
