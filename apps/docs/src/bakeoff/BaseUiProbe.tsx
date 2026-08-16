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

export default function BaseUiProbe() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Base UI probe (evaluation only)</h1>
      <p className="text-sm text-muted-foreground">
        Every primitive below is mounted open with a <code>probe-*</code> marker
        class. Read the attributes off the DOM; do not style against this page.
      </p>

      {/* Dialog — open, plus a closed trigger for the closed-state attrs */}
      <Dialog.Root open>
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

      {/* Menu (Radix DropdownMenu's replacement) */}
      <Menu.Root open>
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

      {/* Select */}
      <Select.Root defaultValue="a" open>
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
