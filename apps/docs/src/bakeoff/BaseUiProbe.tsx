/**
 * Base UI attribute probe — Phase 0 of docs/BASE-UI-MIGRATION.md.
 *
 * MIGRATION.md flags Base UI's data attributes and CSS variables as UNVERIFIED,
 * and they are the largest mechanical surface of the port (~198 selectors,
 * 13 variables). This page renders each primitive mounted-open with marker
 * classes so the actual attribute names can be read off the live DOM in a
 * browser — empirically, not from documentation.
 *
 * Evaluation-only, like everything in bakeoff/: not part of the system, never
 * shipped, deleted when the migration completes. No styling beyond what makes
 * the popups exist — the point is the DOM, not the look.
 */

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Select } from "@base-ui/react/select";
import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import { Tabs } from "@base-ui/react/tabs";
import { Collapsible } from "@base-ui/react/collapsible";
import { Checkbox } from "@base-ui/react/checkbox";

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 1 additions — the two things the static Phase 0 page could not see.
 *
 * 1. AnimationProbe: `data-closed` / `data-starting-style` / `data-ending-style`
 *    only exist mid-transition, so a mounted-open snapshot never shows them.
 *    This dialog wears the EXACT classes the ported @koc/dialog will wear, and a
 *    rAF sampler records every attribute/animation change on trigger, backdrop
 *    and popup into `window.__animLog` — read it after an open/close cycle.
 *
 * 2. FocusProbe: confirm-dialog's divergence #2 (initial focus must land on
 *    Cancel, never the destructive action). Probe A is Base's default behaviour
 *    with Cancel merely ordered first; probe B passes `initialFocus` explicitly.
 *    `onOpenChangeComplete` reports where focus actually landed.
 */

const WATCHED_ATTRS = [
  "data-open",
  "data-closed",
  "data-starting-style",
  "data-ending-style",
  "data-popup-open",
] as const;

function AnimationProbe() {
  // MutationObserver + animation events, NOT requestAnimationFrame: rAF does
  // not fire while the tab/pane is hidden, and this page gets driven from
  // automation whose viewport may be. Mutations and animation events fire
  // regardless of visibility, and catch one-frame states like
  // data-starting-style exactly.
  React.useEffect(() => {
    const log: Array<{ t: number; key: string; event: string; attrs: string }> = [];
    (window as unknown as { __animLog: unknown }).__animLog = log;
    const t0 = performance.now();
    const keyOf = (n: Node) =>
      n instanceof HTMLElement ? n.getAttribute("data-probe-anim") : null;
    const snap = (el: HTMLElement, event: string) => {
      log.push({
        t: Math.round(performance.now() - t0),
        key: el.getAttribute("data-probe-anim") ?? "?",
        event,
        attrs: WATCHED_ATTRS.filter((a) => el.hasAttribute(a)).join(" ") || "(none)",
      });
    };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && keyOf(m.target)) {
          snap(m.target as HTMLElement, `attr ${m.attributeName}`);
        }
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          for (const el of [n, ...n.querySelectorAll<HTMLElement>("[data-probe-anim]")]) {
            if (keyOf(el)) snap(el, "mount");
          }
        }
        for (const n of m.removedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          for (const el of [n, ...n.querySelectorAll<HTMLElement>("[data-probe-anim]")]) {
            if (keyOf(el)) snap(el, "unmount");
          }
        }
      }
    });
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...WATCHED_ATTRS],
    });
    const onAnim = (event: string) => (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLElement && keyOf(el)) {
        snap(el, `${event} ${(e as AnimationEvent).animationName}`);
      }
    };
    const starts = onAnim("animationstart");
    const ends = onAnim("animationend");
    const cancels = onAnim("animationcancel");
    document.addEventListener("animationstart", starts, true);
    document.addEventListener("animationend", ends, true);
    document.addEventListener("animationcancel", cancels, true);
    return () => {
      mo.disconnect();
      document.removeEventListener("animationstart", starts, true);
      document.removeEventListener("animationend", ends, true);
      document.removeEventListener("animationcancel", cancels, true);
    };
  }, []);

  return (
    <Dialog.Root>
      <Dialog.Trigger data-probe-anim="trigger" className="rounded border px-2 py-1">
        animation probe — open dialog
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          data-probe-anim="backdrop"
          className="fixed inset-0 z-50 bg-black/50 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-closed:duration-slow data-closed:ease-in data-open:duration-slower data-open:ease-out"
        />
        <Dialog.Popup
          data-probe-anim="popup"
          className="fixed top-[50%] left-[50%] z-50 w-80 translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none data-closed:animate-out data-closed:duration-slow data-closed:ease-in data-closed:fade-out-0 data-closed:slide-out-to-bottom-8 data-open:animate-in data-open:duration-slower data-open:ease-out data-open:fade-in-0 data-open:slide-in-from-bottom-8"
        >
          <Dialog.Title>Animation probe</Dialog.Title>
          <Dialog.Description>
            Exact classes of the ported dialog. Close and read window.__animLog.
          </Dialog.Description>
          <Dialog.Close className="mt-2 rounded border px-2 py-1">close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FocusProbe() {
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const [landed, setLanded] = React.useState("(nothing opened yet)");
  const report = (which: string) => (open: boolean) => {
    if (!open) return;
    const a = document.activeElement as HTMLElement | null;
    setLanded(
      `${which}: focus landed on ${a ? `${a.tagName.toLowerCase()} "${(a.textContent ?? "").trim().slice(0, 30)}"` : "(nothing)"}`,
    );
  };
  const popupClass =
    "fixed top-[50%] left-[50%] z-50 w-80 translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 outline-none";
  return (
    <div className="flex items-center gap-4">
      <Dialog.Root onOpenChangeComplete={report("A (default)")}>
        <Dialog.Trigger data-probe-focus="a" className="rounded border px-2 py-1">
          focus probe A — ordering only
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className={popupClass}>
            <Dialog.Title>Ordering only</Dialog.Title>
            <div className="mt-2 flex gap-2">
              <Dialog.Close className="rounded border px-2 py-1">Cancel</Dialog.Close>
              <Dialog.Close className="rounded border px-2 py-1">Delete</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root onOpenChangeComplete={report("B (initialFocus)")}>
        <Dialog.Trigger data-probe-focus="b" className="rounded border px-2 py-1">
          focus probe B — initialFocus ref
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className={popupClass} initialFocus={cancelRef}>
            <Dialog.Title>Explicit initialFocus</Dialog.Title>
            <div className="mt-2 flex gap-2">
              <Dialog.Close ref={cancelRef} className="rounded border px-2 py-1">
                Cancel
              </Dialog.Close>
              <Dialog.Close className="rounded border px-2 py-1">Delete</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <span data-probe-focus-result className="text-sm text-muted-foreground">
        {landed}
      </span>
    </div>
  );
}

export default function BaseUiProbe() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Base UI probe (evaluation only)</h1>
      <p className="text-sm text-muted-foreground">
        Every primitive below is mounted open with a <code>probe-*</code> marker
        class. Read the attributes off the DOM; do not style against this page.
      </p>

      {/* Phase 1 — interactive probes: animation lifecycle and initial focus */}
      <AnimationProbe />
      <FocusProbe />

      {/* Dialog — open, plus a closed trigger for the closed-state attrs.
          modal={false} so this always-open dialog does not block pointer
          interaction with the Phase 1 probes above. */}
      <Dialog.Root open modal={false}>
        <Dialog.Trigger className="probe-dialog-trigger-open">dialog trigger (open)</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="probe-dialog-backdrop" />
          <Dialog.Popup className="probe-dialog-popup" style={{ position: "fixed", top: 8, left: 8 }}>
            <Dialog.Title>probe dialog</Dialog.Title>
            <Dialog.Description>attributes under inspection</Dialog.Description>
            <Dialog.Close className="probe-dialog-close">close</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root>
        <Dialog.Trigger className="probe-dialog-trigger-closed">dialog trigger (closed)</Dialog.Trigger>
      </Dialog.Root>

      {/* Menu (Radix DropdownMenu's replacement).
          modal={false}, like the dialog above: an always-open modal popup
          renders an inert layer that intercepts pointer events page-wide,
          which would dead-lock the interactive Phase 1 probes. */}
      <Menu.Root open modal={false}>
        <Menu.Trigger className="probe-menu-trigger">menu trigger</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="probe-menu-positioner" sideOffset={4}>
            <Menu.Popup className="probe-menu-popup">
              <Menu.Item className="probe-menu-item">item one</Menu.Item>
              <Menu.Item className="probe-menu-item-disabled" disabled>disabled item</Menu.Item>
              <Menu.Separator className="probe-menu-separator" />
              <Menu.Item>item two</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Select — modal={false} for the same reason as the menu */}
      <Select.Root defaultValue="a" open modal={false}>
        <Select.Trigger className="probe-select-trigger">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="probe-select-positioner">
            <Select.Popup className="probe-select-popup">
              <Select.Item className="probe-select-item" value="a">
                <Select.ItemText>option a</Select.ItemText>
              </Select.Item>
              <Select.Item className="probe-select-item-b" value="b">
                <Select.ItemText>option b</Select.ItemText>
              </Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      {/* Popover */}
      <Popover.Root open>
        <Popover.Trigger className="probe-popover-trigger">popover trigger</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="probe-popover-positioner" sideOffset={4}>
            <Popover.Popup className="probe-popover-popup">popover content</Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {/* Tooltip */}
      <Tooltip.Provider>
        <Tooltip.Root open>
          <Tooltip.Trigger className="probe-tooltip-trigger">tooltip trigger</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner className="probe-tooltip-positioner" sideOffset={4}>
              <Tooltip.Popup className="probe-tooltip-popup">tooltip content</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      {/* Tabs — the indicator is divergence #1's subject */}
      <Tabs.Root defaultValue="one">
        <Tabs.List className="probe-tabs-list">
          <Tabs.Tab className="probe-tabs-tab-active" value="one">tab one</Tabs.Tab>
          <Tabs.Tab className="probe-tabs-tab-inactive" value="two">tab two</Tabs.Tab>
          <Tabs.Indicator className="probe-tabs-indicator" />
        </Tabs.List>
        <Tabs.Panel className="probe-tabs-panel" value="one">panel one</Tabs.Panel>
        <Tabs.Panel value="two">panel two</Tabs.Panel>
      </Tabs.Root>

      {/* Collapsible — open and closed */}
      <Collapsible.Root defaultOpen>
        <Collapsible.Trigger className="probe-collapsible-trigger-open">collapsible (open)</Collapsible.Trigger>
        <Collapsible.Panel className="probe-collapsible-panel">collapsible content</Collapsible.Panel>
      </Collapsible.Root>
      <Collapsible.Root>
        <Collapsible.Trigger className="probe-collapsible-trigger-closed">collapsible (closed)</Collapsible.Trigger>
        <Collapsible.Panel>never visible</Collapsible.Panel>
      </Collapsible.Root>

      {/* Checkbox — checked and unchecked */}
      <label>
        <Checkbox.Root className="probe-checkbox-checked" defaultChecked>
          <Checkbox.Indicator className="probe-checkbox-indicator" />
        </Checkbox.Root>{" "}
        checked
      </label>
      <label>
        <Checkbox.Root className="probe-checkbox-unchecked">
          <Checkbox.Indicator />
        </Checkbox.Root>{" "}
        unchecked
      </label>
    </div>
  );
}
