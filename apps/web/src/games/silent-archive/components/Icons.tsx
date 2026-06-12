export function RecorderIcon({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.72);
  return (
    <svg width={size} height={h} viewBox="0 0 20 14" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="19" height="13" rx="1.5" stroke="currentColor" strokeWidth="1" />
      <rect
        x="3"
        y="3"
        width="8"
        height="8"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="0.75"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <circle cx="15.5" cy="7" r="2.8" stroke="currentColor" strokeWidth="1" />
      <circle cx="15.5" cy="7" r="1.1" fill="currentColor" />
      <line
        x1="3"
        y1="5.5"
        x2="11"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.5"
      />
      <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      <line x1="3" y1="8.5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
    </svg>
  );
}

export function IncidentIcon({ size = 12 }: { size?: number }) {
  const h = Math.round(size * 1.25);
  return (
    <svg width={size} height={h} viewBox="0 0 10 14" fill="none" aria-hidden>
      <path d="M5.8 0.5 L1.2 7.5 H4.5 L4.2 13.5 L8.8 6.5 H5.5 Z" fill="currentColor" />
    </svg>
  );
}

export function DamageIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 1.5 17.5 5v6.2c0 3.5-3.1 6.2-7.5 7.3-4.4-1.1-7.5-3.8-7.5-7.3V5L10 1.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="m10.7 3.2-2.4 5 2.3 1.1-2.1 2.1 1.2 1.2-2 3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.3 8.2-2.7 1.4M10.6 9.3l3.5 1.5M8.5 11.4l-2.1 1.8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.72"
      />
    </svg>
  );
}

export function ArchiveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="7" cy="7" r="0.9" fill="currentColor" />
      <line x1="7" y1="0.5" x2="7" y2="4.5" stroke="currentColor" strokeWidth="0.9" />
      <line x1="10.9" y1="2.2" x2="8.8" y2="4.3" stroke="currentColor" strokeWidth="0.9" />
      <line x1="13.5" y1="7" x2="9.5" y2="7" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M8 18.5V12.5C8 8.08 11.58 4.5 16 4.5s8 3.58 8 8v6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="16.5"
        width="5.5"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="22.5"
        y="16.5"
        width="5.5"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <line
        x1="9.5"
        y1="12"
        x2="22.5"
        y2="12"
        stroke="currentColor"
        strokeWidth="0.65"
        opacity="0.35"
      />
      <circle cx="6.75" cy="21.5" r="1.1" fill="currentColor" fillOpacity="0.35" />
      <circle cx="25.25" cy="21.5" r="1.1" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}

export function RestartIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M6.5 1.5 C3.7 1.5 1.5 3.7 1.5 6.5 C1.5 9.3 3.7 11.5 6.5 11.5 C9.3 11.5 11.5 9.3 11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M11.5 4 V7 H8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KeycardIcon({ size = 16 }: { size?: number }) {
  const h = Math.round(size * 0.65);
  return (
    <svg width={size} height={h} viewBox="0 0 20 13" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="19" height="12" rx="1.5" stroke="currentColor" strokeWidth="1" />
      <rect x="2" y="2.5" width="5" height="4" rx="0.5" fill="currentColor" fillOpacity="0.45" />
      <line x1="9" y1="3.5" x2="18" y2="3.5" stroke="currentColor" strokeWidth="0.8" />
      <line
        x1="9"
        y1="5.5"
        x2="15"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.5"
      />
      <line
        x1="2"
        y1="9.5"
        x2="18"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2 1.5"
        opacity="0.35"
      />
    </svg>
  );
}

export function LocationIcon({ size = 11 }: { size?: number }) {
  const h = Math.round(size * 1.35);
  return (
    <svg width={size} height={h} viewBox="0 0 11 15" fill="none" aria-hidden>
      <path
        d="M5.5 0.8 C2.7 0.8 0.5 3 0.5 5.8 C0.5 9.5 5.5 14.2 5.5 14.2 C5.5 14.2 10.5 9.5 10.5 5.8 C10.5 3 8.3 0.8 5.5 0.8Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="5.5" cy="5.8" r="1.8" fill="currentColor" fillOpacity="0.65" />
    </svg>
  );
}

export function SkullIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 1.5 C5.1 1.5 2 4.6 2 8.5 C2 11.2 3.5 13.5 5.5 14.5 L5.5 16.5 H12.5 V14.5 C14.5 13.5 16 11.2 16 8.5 C16 4.6 12.9 1.5 9 1.5Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="6.5" cy="8.5" r="1.8" fill="currentColor" fillOpacity="0.8" />
      <circle cx="11.5" cy="8.5" r="1.8" fill="currentColor" fillOpacity="0.8" />
      <line x1="7.5" y1="16.5" x2="7.5" y2="14" stroke="currentColor" strokeWidth="0.8" />
      <line x1="10.5" y1="16.5" x2="10.5" y2="14" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

export function VolumeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1.5 5H3.8L7 2.5V11.5L3.8 9H1.5V5Z"
        stroke="currentColor"
        strokeWidth="0.85"
        fill="currentColor"
        fillOpacity="0.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 4.8C9.9 5.6 10.4 6.2 10.4 7C10.4 7.8 9.9 8.4 9 9.2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M10.5 2.8C12.2 4.2 13 5.5 13 7C13 8.5 12.2 9.8 10.5 11.2"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function MuteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1.5 5H3.8L7 2.5V11.5L3.8 9H1.5V5Z"
        stroke="currentColor"
        strokeWidth="0.85"
        fill="currentColor"
        fillOpacity="0.2"
        strokeLinejoin="round"
      />
      <line
        x1="9"
        y1="4.5"
        x2="13"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="13"
        y1="4.5"
        x2="9"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon({ size = 10 }: { size?: number }) {
  const h = Math.round(size * 1.2);
  return (
    <svg width={size} height={h} viewBox="0 0 10 12" fill="none" aria-hidden>
      <rect
        x="0.75"
        y="5"
        width="8.5"
        height="6.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="0.9"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path
        d="M2.75 5V3.8 C2.75 1.8 7.25 1.8 7.25 3.8 V5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="5" cy="8.2" r="1" fill="currentColor" fillOpacity="0.65" />
      <line
        x1="5"
        y1="9.2"
        x2="5"
        y2="10.2"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SunIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1" />
      <line
        x1="6"
        y1="0.5"
        x2="6"
        y2="2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="6"
        y1="10"
        x2="6"
        y2="11.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="0.5"
        y1="6"
        x2="2"
        y2="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="6"
        x2="11.5"
        y2="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="1.8"
        y1="1.8"
        x2="2.9"
        y2="2.9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="9.1"
        y1="9.1"
        x2="10.2"
        y2="10.2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="10.2"
        y1="1.8"
        x2="9.1"
        y2="2.9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="2.9"
        y1="9.1"
        x2="1.8"
        y2="10.2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M10 6.5C10 8.98 7.98 11 5.5 11C3.02 11 1 8.98 1 6.5C1 4.02 3.02 2 5.5 2C4.62 2.9 4.08 4.13 4.08 5.5C4.08 8.04 6.04 10 8.58 10C9.13 10 9.66 9.9 10.15 9.72C10.05 8.66 10 7.59 10 6.5Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GridIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="1" y="1" width="4" height="4" rx="0.6" fill="currentColor" fillOpacity="0.9" />
      <rect x="7" y="1" width="4" height="4" rx="0.6" fill="currentColor" fillOpacity="0.9" />
      <rect x="1" y="7" width="4" height="4" rx="0.6" fill="currentColor" fillOpacity="0.9" />
      <rect x="7" y="7" width="4" height="4" rx="0.6" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}

export function BugIcon({ size = 12 }: { size?: number }) {
  const h = Math.round((size * 14) / 12);
  return (
    <svg width={size} height={h} viewBox="0 0 12 14" fill="none" aria-hidden>
      <path
        d="M4.5 1.8 C3.2 0.4 1.8 0.5 1.2 1"
        stroke="currentColor"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      <path
        d="M7.5 1.8 C8.8 0.4 10.2 0.5 10.8 1"
        stroke="currentColor"
        strokeWidth="0.85"
        strokeLinecap="round"
      />
      <circle cx="6" cy="3.2" r="1.7" stroke="currentColor" strokeWidth="0.95" />
      <line
        x1="3.5"
        y1="4.9"
        x2="8.5"
        y2="4.9"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.45"
      />
      <ellipse cx="6" cy="9.4" rx="3" ry="4" stroke="currentColor" strokeWidth="0.95" />
      <line
        x1="6"
        y1="5"
        x2="6"
        y2="13.2"
        stroke="currentColor"
        strokeWidth="0.45"
        opacity="0.35"
      />
      <line
        x1="3"
        y1="7.2"
        x2="0.5"
        y2="5.8"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <line
        x1="3"
        y1="9.4"
        x2="0.5"
        y2="9.4"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <line
        x1="3"
        y1="11.6"
        x2="0.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="7.2"
        x2="11.5"
        y2="5.8"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="9.4"
        x2="11.5"
        y2="9.4"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="11.6"
        x2="11.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HealingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.6 13.2 4.2v4.1c0 2.5-2.2 4.4-5.2 5.2-3-.8-5.2-2.7-5.2-5.2V4.2L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M8 4.8v4.8M5.6 7.2h4.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 13.5V8.2M6.2 13.5V5.4M9.8 13.5V9.1M13.5 13.5V3.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M1.5 13.5h13"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <line
        x1="2"
        y1="2"
        x2="10"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="2"
        x2="2"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
