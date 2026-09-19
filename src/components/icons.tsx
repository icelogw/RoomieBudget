/**
 * Hand-drawn 20px icons on a 20-unit grid, stroked with currentColor so they
 * inherit whatever the surrounding text is doing.
 *
 * Inline rather than an icon package: three icons do not justify a dependency,
 * and emoji would undercut the rest of the interface.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ReceiptIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 2.5h11v15l-2-1.3-1.8 1.3-1.7-1.3-1.7 1.3-1.8-1.3-2 1.3v-15Z" />
      <path d="M7.5 7h5M7.5 10.5h5" />
    </svg>
  );
}

export function ScalesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 3v14M6 17h8M3 7.5h14M10 3.5 3 7.5M10 3.5l7 4" />
      <path d="M3 7.5 1.5 12a2.6 2.6 0 0 0 3 0L3 7.5ZM17 7.5 15.5 12a2.6 2.6 0 0 0 3 0L17 7.5Z" />
    </svg>
  );
}

export function HouseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" />
      <path d="M8 17v-5h4v5" />
    </svg>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 7V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5.5 8 10 12.5 14.5 8" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 10.5 8 14l7.5-8" />
    </svg>
  );
}
