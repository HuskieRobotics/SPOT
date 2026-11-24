"use client";

/**
 * The settings menu (SC-3, SC-4, OF-8), on every page of the scouting client: the theme, the
 * analysis and admin pages, feedback, reload, the join code, sign-out and resetting the app's
 * data. During a match it also holds the 2× clock for scouting from a video played at double
 * speed (BL-230): two taps and a confirmation away, so it is never pressed by accident.
 */
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";
import { Dialog } from "./dialog";

export const FEEDBACK_URL = "https://github.com/HuskieRobotics/SPOT/issues";

export interface SettingsMenuProps {
  signedIn: boolean;
  onSignOut?(): void;
  onChangeJoinCode(): void;
  onReset(): void;
  /** During a match: the clock's speed and how to change it (BL-230). */
  speed?: { value: number; set(speed: number): void };
}

const item =
  "hover:bg-muted w-full rounded-md px-3 py-2 text-left text-sm disabled:opacity-50 block";

export function SettingsMenu({
  signedIn,
  onSignOut,
  onChangeJoinCode,
  onReset,
  speed,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmDouble, setConfirmDouble] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const close = () => setOpen(false);
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="shrink-0"
      >
        <Menu />
      </Button>
      {open && (
        <>
          {/* A tap outside the menu closes it (SC-3). */}
          <div className="fixed inset-0 z-40" aria-hidden onClick={close} />
          <nav
            aria-label="Settings"
            className="bg-popover text-popover-foreground fixed top-2 left-2 z-40 flex max-h-[calc(100dvh-1rem)] w-64 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5 shadow-lg"
          >
            <button
              type="button"
              className={item}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                setThemeState(next);
              }}
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {speed &&
              (speed.value === 1 ? (
                <button
                  type="button"
                  className={item}
                  onClick={choose(() => setConfirmDouble(true))}
                >
                  2× speed, for a video…
                </button>
              ) : (
                <button type="button" className={item} onClick={choose(() => speed.set(1))}>
                  Back to normal speed
                </button>
              ))}
            <a className={item} href="/analysis" target="_blank" rel="noopener" onClick={close}>
              Analysis
            </a>
            <a className={item} href="/admin" target="_blank" rel="noopener" onClick={close}>
              Admin
            </a>
            <a className={item} href={FEEDBACK_URL} target="_blank" rel="noopener" onClick={close}>
              Give feedback
            </a>
            <button type="button" className={item} onClick={choose(() => location.reload())}>
              Reload
            </button>
            <button type="button" className={item} onClick={choose(onChangeJoinCode)}>
              Change join code
            </button>
            {signedIn && onSignOut && (
              <button type="button" className={item} onClick={choose(onSignOut)}>
                Sign out
              </button>
            )}
            <button type="button" className={`${item} text-destructive`} onClick={choose(onReset)}>
              Reset app data
            </button>
          </nav>
        </>
      )}
      {confirmDouble && speed && (
        <Dialog
          title="Play the clock at 2×?"
          actions={
            <>
              <Button variant="outline" onClick={() => setConfirmDouble(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  speed.set(2);
                  setConfirmDouble(false);
                }}
              >
                Play at 2×
              </Button>
            </>
          }
        >
          Only for scouting a recording played at double speed. The match clock runs twice as fast,
          and the times recorded stay in match time.
        </Dialog>
      )}
    </>
  );
}
