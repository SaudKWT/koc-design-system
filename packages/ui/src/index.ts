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
