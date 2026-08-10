# Reference only — does not compile

`shadcn-space/` holds three components installed from the `@shadcn-space`
registry on 2026-08-10: `dialog-02`, `calendar-16`, `topbar-05`.

**They are written for Base UI. This project is on Radix.** They produce 20 type
errors — `render={<Button/>}` where Radix wants `asChild`, `data-open:` where
Radix emits `data-[state=open]`, plus four lucide icons that do not exist in our
version. They are excluded from `tsconfig.json` so the build stays green.

They are kept because the *designs* are worth porting, not the code:

- **dialog-02** — centred-icon destructive confirm. A genuinely useful pattern
  for voiding or deleting a report. ~52 LOC, mechanical to port.
- **calendar-16** — date + time range scheduler with duration. A booking UI, not
  a filter; only worth porting if KOC needs maintenance-window scheduling.
- **topbar-05** — topbar with notifications, profile and nav. Overlaps AppShell,
  and its language switcher is dead weight under ADR 0001, but the notification
  and profile menus are a real gap in our shell.

Do not import from this directory. Port the arrangement against `@koc/ui`
primitives instead.
