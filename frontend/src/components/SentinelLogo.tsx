"use client";

import clsx from "clsx";

interface SentinelLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * Geometric sentinel/shield mark — brand violet gradient.
 * Abstract layered shield with an inner "S" path and scanning line.
 */
export function SentinelMark({ size = 28, className, glow }: SentinelLogoProps) {
  const id = "sm";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={clsx(glow && "drop-shadow-[0_0_14px_rgba(124,92,252,0.65)]", className)}
    >
      <defs>
        {/* Shield fill gradient — deep violet core fading out */}
        <radialGradient id={`${id}-fill`} cx="50%" cy="30%" r="70%" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CFC" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7C5CFC" stopOpacity="0.03" />
        </radialGradient>
        {/* Shield stroke — bright top, invisible bottom */}
        <linearGradient id={`${id}-stroke`} x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#7C5CFC" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7C5CFC" stopOpacity="0.08" />
        </linearGradient>
        {/* S letterform gradient */}
        <linearGradient id={`${id}-s`} x1="12" y1="10" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4C6FF" />
          <stop offset="1" stopColor="#7C5CFC" />
        </linearGradient>
        {/* Glow filter */}
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer shield — filled + stroked */}
      <path
        d="M16 2.5L4.5 8.2v7.8c0 7.4 5.3 14.1 11.5 15.7C22.2 30.1 27.5 23.4 27.5 16V8.2L16 2.5z"
        fill={`url(#${id}-fill)`}
        stroke={`url(#${id}-stroke)`}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* Inner glow ring */}
      <path
        d="M16 5.5L7.5 10.2v5.8c0 5.4 3.7 10.4 8.5 11.8 4.8-1.4 8.5-6.4 8.5-11.8v-5.8L16 5.5z"
        fill="none"
        stroke="rgba(124,92,252,0.18)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* S letterform — crisp, centered */}
      <path
        d="M13 12.8c0-1.1 1.3-2 3-2s3 .9 3 2c0 1.3-1.8 1.8-3 2.4-1.2.6-3 1.1-3 2.4 0 1.1 1.3 2 3 2s3-.9 3-2"
        stroke={`url(#${id}-s)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${id}-glow)`}
      />
    </svg>
  );
}

/**
 * Designed AI Agent mark — replaces generic Bot emoji.
 * Geometric eye/neural node within a rounded frame.
 */
export function AgentMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded square frame */}
      <rect
        x="4" y="4" width="24" height="24" rx="8"
        fill="rgba(124,92,252,0.08)"
        stroke="rgba(124,92,252,0.2)"
        strokeWidth="1"
      />
      {/* Outer eye / lens */}
      <ellipse
        cx="16" cy="16" rx="7" ry="5"
        fill="none"
        stroke="url(#agent-gradient)"
        strokeWidth="1.2"
      />
      {/* Inner iris */}
      <circle
        cx="16" cy="16" r="2.5"
        fill="url(#iris-gradient)"
      />
      {/* Pupil dot */}
      <circle cx="16" cy="16" r="1" fill="#18181b" />
      {/* Neural nodes */}
      <circle cx="8" cy="11" r="1" fill="rgba(124,92,252,0.3)" />
      <circle cx="24" cy="11" r="1" fill="rgba(124,92,252,0.3)" />
      <circle cx="8" cy="21" r="1" fill="rgba(124,92,252,0.3)" />
      <circle cx="24" cy="21" r="1" fill="rgba(124,92,252,0.3)" />
      {/* Neural connections */}
      <line x1="9" y1="11.5" x2="12" y2="14" stroke="rgba(124,92,252,0.15)" strokeWidth="0.5" />
      <line x1="23" y1="11.5" x2="20" y2="14" stroke="rgba(124,92,252,0.15)" strokeWidth="0.5" />
      <line x1="9" y1="20.5" x2="12" y2="18" stroke="rgba(124,92,252,0.15)" strokeWidth="0.5" />
      <line x1="23" y1="20.5" x2="20" y2="18" stroke="rgba(124,92,252,0.15)" strokeWidth="0.5" />
      <defs>
        <linearGradient id="agent-gradient" x1="9" y1="11" x2="23" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B8A1FF" />
          <stop offset="1" stopColor="#7C5CFC" />
        </linearGradient>
        <radialGradient id="iris-gradient" cx="16" cy="16" r="2.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B8A1FF" />
          <stop offset="1" stopColor="#7C5CFC" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Full wordmark: SENTINEL in Syne display font + "Support" light
 */
export function SentinelWordmark({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-baseline gap-1.5", className)}>
      <span className="text-[17px] font-display font-extrabold tracking-[0.12em] text-white uppercase">
        SENTINEL
      </span>
      <span className="text-[12px] font-light tracking-wide text-zinc-500">
        Support
      </span>
    </div>
  );
}

/**
 * Combined logo: Mark + Wordmark
 */
export function SentinelLogoFull({ size = 28, glow, className }: SentinelLogoProps) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <SentinelMark size={size} glow={glow} />
      <SentinelWordmark />
    </div>
  );
}
