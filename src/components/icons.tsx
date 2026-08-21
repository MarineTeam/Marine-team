/**
 * One stroked icon set, shared by the sidebar, the app bar, the tab strip and
 * the profile rows.
 *
 * They live together because the chrome only reads as one app if the icons
 * agree: same 24-unit box, same 1.75 stroke, same round caps. Each takes only
 * a className so callers size and colour them with utilities
 * (`h-6 w-6 text-accent`) rather than baking either in here.
 */

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </Icon>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.9-3.9" />
    </Icon>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4.5z" />
    </Icon>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </Icon>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M11 4l1.2 3.8L16 9l-3.8 1.2L11 14l-1.2-3.8L6 9l3.8-1.2L11 4z" />
      <path d="M17.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z" />
    </Icon>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17s-2.5-2-2.5-8" />
      <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
    </Icon>
  );
}

export function FolderIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.5.7l1 1.3h7.3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function PlaylistIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 7h11M4 12h11M4 17h7" />
      <path d="m17 12.5 4 2.5-4 2.5z" />
    </Icon>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 3.5H20v17H6.5A2.5 2.5 0 0 1 4 18V6a2.5 2.5 0 0 1 2.5-2.5z" />
    </Icon>
  );
}

export function LiveIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.5 18.5a9.2 9.2 0 0 1 0-13M18.5 5.5a9.2 9.2 0 0 1 0 13" />
    </Icon>
  );
}

export function InboxIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.5 13.5h4l1.2 2.2h6.6l1.2-2.2h4" />
      <path d="M5.6 5.5h12.8l2.1 8v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V13.5z" />
    </Icon>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4v10" />
      <path d="m8 10.5 4 4 4-4" />
      <path d="M4.5 18.5h15" />
    </Icon>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" />
    </Icon>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.2a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
    </Icon>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Icon>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z" />
    </Icon>
  );
}
