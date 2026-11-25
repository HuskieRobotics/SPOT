"use client";

/**
 * Offering to install SPOT on the device's home screen (SC-5, #361), once per device: an
 * installed app opens like any other, with or without a connection. Browsers that offer it
 * (Chrome and Edge, on Android and desktop) send `beforeinstallprompt`; elsewhere, such as
 * Safari, nothing is shown and the browser's own Add to Home Screen still works.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeviceStore } from "@/scouter/device";
import { Dialog } from "./dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export function InstallPrompt({ store, show }: { store: DeviceStore; show: boolean }) {
  const [offer, setOffer] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      if (store.installAsked()) return; // the browser's own banner, then
      event.preventDefault();
      setOffer(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, [store]);
  if (!offer || !show) return null;
  const answer = (install: boolean) => {
    store.setInstallAsked();
    setOffer(null);
    if (install) void offer.prompt().catch(() => undefined);
  };
  return (
    <Dialog
      title="Install SPOT?"
      actions={
        <>
          <Button variant="outline" onClick={() => answer(false)}>
            Not now
          </Button>
          <Button onClick={() => answer(true)}>Install</Button>
        </>
      }
    >
      SPOT can go on this device&apos;s home screen and open like an app, with or without a
      connection.
    </Dialog>
  );
}
