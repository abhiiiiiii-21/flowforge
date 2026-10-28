"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useState,
  type DragEvent,
  type CSSProperties,
} from "react";
import { useReactFlow } from "@xyflow/react";
import { UserButton } from "@clerk/nextjs";
import {
  PanelLeft,
  Home,
  Search,
  Type,
  Image as ImageIcon,
  Video,
  Brain,
  Crop,
  Film,
} from "lucide-react";
import { NODE_PALETTE, type NodePaletteItem } from "@/lib/connectionRules";
import { useWorkflowStore } from "@/store/workflowStore";

const ICON_COMPONENTS: Record<string, typeof Type> = {
  Type,
  Image: ImageIcon,
  Video,
  Brain,
  Crop,
  Film,
};

/**
 * Per-node-type accent gradients used as the colored icon tile background
 * when the sidebar is collapsed (matches krea's app-icon look).
 */
const NODE_TILE_BG: Record<string, string> = {
  text: "linear-gradient(135deg, #fbbf24, #d97706)",
  upload_image: "linear-gradient(135deg, #fb923c, #ea580c)",
  upload_video: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  llm: "linear-gradient(135deg, #c084fc, #7e22ce)",
  crop_image: "linear-gradient(135deg, #38bdf8, #0284c7)",
  extract_frame: "linear-gradient(135deg, #34d399, #059669)",
};

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

function SidebarInner({ open, onToggle }: SidebarProps) {
  const [search, setSearch] = useState("");
  const addNode = useWorkflowStore((s) => s.addNode);
  const reactFlowInstance = useReactFlow();

  const onDragStart = useCallback(
    (event: DragEvent, item: NodePaletteItem) => {
      event.dataTransfer.setData("application/reactflow-type", item.type);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const onClickAdd = useCallback(
    (item: NodePaletteItem) => {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const centerX = (-x + window.innerWidth / 2) / zoom;
      const centerY = (-y + window.innerHeight / 2) / zoom;
      const offset = () => Math.floor(Math.random() * 60) - 30;
      addNode(item.type, {
        x: centerX + offset(),
        y: centerY + offset(),
      });
    },
    [addNode, reactFlowInstance],
  );

  const handleSearchClick = useCallback(() => {
    if (!open) onToggle();
  }, [open, onToggle]);

  const filtered = NODE_PALETTE.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <aside className={`sidebar ${open ? "sidebar--open" : "sidebar--closed"}`}>
      <div className="sidebar__top">
        <button
          type="button"
          className="sidebar__row sidebar__row--toggle"
          onClick={onToggle}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          title="Toggle sidebar"
        >
          <span className="sidebar__icon-slot sidebar__icon-slot--ghost">
            <PanelLeft size={18} />
          </span>
        </button>

        <Link
          href="/"
          className="sidebar__row sidebar__row--link"
          aria-label="Home"
          title="Home"
        >
          <span className="sidebar__icon-slot sidebar__icon-slot--ghost">
            <Home size={18} />
          </span>
          <span className="sidebar__label">Home</span>
        </Link>

        {open ? (
          <div className="sidebar__search-wrap">
            <Search size={14} className="sidebar__search-icon" />
            <input
              className="sidebar__search-input"
              placeholder="Search nodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            className="sidebar__row"
            onClick={handleSearchClick}
            aria-label="Search nodes"
            title="Search"
          >
            <span className="sidebar__icon-slot sidebar__icon-slot--ghost">
              <Search size={18} />
            </span>
          </button>
        )}

        {open && <div className="sidebar__section-label">Tools</div>}

        <div className="sidebar__nodes">
          {filtered.map((item) => (
            <NodeRow
              key={item.type}
              item={item}
              onDragStart={onDragStart}
              onClick={onClickAdd}
            />
          ))}
          {open && filtered.length === 0 && (
            <div className="sidebar__empty">No nodes match &ldquo;{search}&rdquo;</div>
          )}
        </div>
      </div>

      <div className="sidebar__footer">
        <UserAvatarSlot />
      </div>
    </aside>
  );
}

function NodeRow({
  item,
  onDragStart,
  onClick,
}: {
  item: NodePaletteItem;
  onDragStart: (e: DragEvent, item: NodePaletteItem) => void;
  onClick: (item: NodePaletteItem) => void;
}) {
  const Icon = ICON_COMPONENTS[item.icon] ?? Type;
  const tileBg = NODE_TILE_BG[item.type] ?? "var(--bg-button)";
  const tileStyle: CSSProperties = { background: tileBg };

  return (
    <button
      type="button"
      className="sidebar__row sidebar__row--node"
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onClick={() => onClick(item)}
      title={item.label}
    >
      <span className="sidebar__icon-slot sidebar__icon-slot--tile" style={tileStyle}>
        <Icon size={16} color="#fff" />
      </span>
      <span className="sidebar__label">{item.label}</span>
    </button>
  );
}

function UserAvatarSlot() {
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkEnabled) {
    return (
      <div className="sidebar__row sidebar__row--user">
        <span className="sidebar__user-circle">N</span>
        <span className="sidebar__label">Sign in</span>
      </div>
    );
  }
  return (
    <div className="sidebar__row sidebar__row--user">
      <span className="sidebar__user-circle sidebar__user-circle--clerk">
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: 28, height: 28 },
            },
          }}
        />
      </span>
      <span className="sidebar__label">Account</span>
    </div>
  );
}

export const Sidebar = memo(SidebarInner);