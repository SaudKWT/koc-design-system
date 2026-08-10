// NOTE: four icons in the upstream version of this file (Form, LayersPlus,
// RectangleCircle, Shredder) only exist in lucide >= 1.x. This project is on
// 0.469, so they are swapped for equivalents that exist here. They appear only
// in the sample navigation below, which a real KOC app replaces entirely.
import { BringToFront, CalendarHeart, ChartColumnBig, CircleArrowDown, Flag, FileText, GalleryVerticalEnd, Grid2x2Plus, Layers, PanelRightClose, Pentagon, Presentation, Square, Shapes, Trash2, Zap } from "lucide-react";

const NavData: any[] = [
    {
        type: "dropdown",
        label: "Dashboards",
        icon: Layers,
        items: [
            { label: "Ecommerce", icon: Grid2x2Plus, href: "#" },
            { label: "Analytics", icon: ChartColumnBig, href: "#" },
            { label: "Projects", icon: BringToFront, href: "#" },
            { label: "Frontend Pages", icon: FileText, href: "#" },
            { label: "Landing Pages", icon: Presentation, href: "#" },
        ],
    },
    {
        type: "dropdown",
        label: "Shadcn UI",
        icon: Shapes,
        items: [
            { label: "Accordian", icon: CircleArrowDown, href: "#" },
            { label: "Alert", icon: Flag, href: "#" },
            { label: "Bedge", icon: Pentagon, href: "#" },
            { label: "Button", icon: Square, href: "#" },
            { label: "Dropdown", icon: GalleryVerticalEnd, href: "#" },
            { label: "Dialog", icon: Zap, href: "#" },
            { label: "Drawer", icon: PanelRightClose, href: "#" },
            { label: "Datepicker", icon: CalendarHeart, href: "#" }
        ]
    },
    {
        type: "link",
        label: "Docs",
        icon: Trash2,
        href: '#'
    }
]

export default NavData;