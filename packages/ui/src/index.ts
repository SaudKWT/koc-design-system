/**
 * @koc/ui — KOC component library.
 *
 * Consumed two ways:
 *   - Workspace import (`@koc/ui`) inside this monorepo.
 *   - `npx shadcn add @koc/<name>` from the registry, which copies the source
 *     into the consuming team's repo so they own and can fork it.
 *
 * Both serve the same files. The registry is generated from this package rather
 * than maintained alongside it, so the two cannot drift.
 */

export { cn } from "./lib/utils";

export { Button, buttonVariants, type ButtonProps } from "./components/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/card";
export { Input, type InputProps } from "./components/input";
export { Label } from "./components/label";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export {
  StatusBadge,
  statusSpecs,
  type OperationalStatus,
  type StatusBadgeProps,
} from "./components/status-badge";
export { StatCard, type StatCardProps, type StatIntent } from "./components/stat-card";
export { Alert, AlertTitle, AlertDescription, alertVariants, type AlertProps } from "./components/alert";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/table";

// ── App shell ───────────────────────────────────────────────────────────────
// The standard KOC team dashboard frame, plus the org model it is configured
// from. A new team dashboard is a TeamConfig, not a new component.

export { AppShell, type AppShellProps, type AppShellUser } from "./components/app-shell";
export {
  ALL_UNITS,
  groupsForUnit,
  unitDisplayName,
  teamItems,
  unitItems,
  type NavItem,
  type NavGroup,
  type Unit,
  type TeamConfig,
} from "./lib/org";

// Underlying primitives, exported so a team can compose its own frame if the
// standard one genuinely does not fit.
export * from "./components/sidebar";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/collapsible";

// ── Data table ──────────────────────────────────────────────────────────────
// Built rather than installed: there is no data table in the shadcn registry,
// only a docs example. See components/data-table.tsx for the reasoning.

export {
  DataTable,
  kocTableFeatures,
  kocColumnHelper,
  type DataTableProps,
  type DataTableEmptyState,
  type KocColumnMeta,
} from "./components/data-table";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "./components/select";
export { Checkbox } from "./components/checkbox";
export { Skeleton } from "./components/skeleton";
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from "./components/tabs";
