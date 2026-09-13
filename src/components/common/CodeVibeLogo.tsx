import React from 'react';

export interface CodyIconProps {
  size?: number | string;
  variant?: 'light' | 'dark';
  className?: string;
  shieldColor?: string;
  barsColor?: string;
  sparkleColor?: string;
  ariaLabel?: string;
}

export type CodeVibeIconProps = CodyIconProps;

/**
 * Cody 3D App Icon
 * - Upper half: Warm Ivory (Base: #F4EFE8, Highlights: #FFFDFC)
 * - Lower half: Muted Champagne / Neutral Silver (Base: #C8C0B7, Highlights: #E5DED6)
 * - Depth/Shadows: Subtle deep warm-brown shadow depth (#241713) against #3A2722
 * - Preserved 3D geometry, extrusion, bevels, highlights and realistic depth
 */
export function CodyIcon({
  size = 32,
  className = '',
  ariaLabel = 'Cody 3D logo',
}: CodyIconProps) {
  const numericSize = typeof size === 'number' ? size : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={numericSize}
      height={numericSize}
      style={{ width: size, height: size }}
      fill="none"
      role="img"
      aria-label={ariaLabel}
      className={`aspect-square select-none shrink-0 ${className}`}
    >
      <defs>
        {/* Soft ambient floor shadow */}
        <filter id="codyFloorBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" />
        </filter>
        <radialGradient id="codyFloorShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#241713" stopOpacity="0.38" />
          <stop offset="60%" stopColor="#241713" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#241713" stopOpacity="0" />
        </radialGradient>

        {/* Continuous C Material Gradient: Warm Ivory at top-left -> Champagne Silver at bottom-right */}
        <linearGradient id="codyMainGrad" x1="22%" y1="12%" x2="78%" y2="88%">
          <stop offset="0%" stopColor="#FFFDFC" />
          <stop offset="22%" stopColor="#F6F0E9" />
          <stop offset="52%" stopColor="#E6DFD6" />
          <stop offset="82%" stopColor="#C9C0B5" />
          <stop offset="100%" stopColor="#B9AEA2" />
        </linearGradient>

        {/* Subtle 3D Edge Bevel Gradient */}
        <linearGradient id="codyBevelGrad" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#FFFDFC" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#9E9285" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6E6257" stopOpacity="0.55" />
        </linearGradient>

        {/* 3D Extrusion Side Wall Gradient (Deep Warm-Brown #241713 Depth) */}
        <linearGradient id="codyExtrudeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#46362F" />
          <stop offset="50%" stopColor="#2A1C17" />
          <stop offset="100%" stopColor="#1B110D" />
        </linearGradient>

        {/* Crown Specular Glint */}
        <linearGradient id="codyCrownGlint" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0" />
          <stop offset="40%" stopColor="#FFFDFC" stopOpacity="0.9" />
          <stop offset="65%" stopColor="#FFFDFC" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFFDFC" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 1. Ground Contact & Ambient Shadow */}
      <ellipse cx="64" cy="107" rx="42" ry="7" fill="url(#codyFloorShadow)" filter="url(#codyFloorBlur)" />
      <ellipse cx="62" cy="103" rx="30" ry="3.5" fill="#241713" opacity="0.32" filter="url(#codyFloorBlur)" />

      {/* 2. 3D Extrusion Base (solid depth, shifted down 6px) */}
      <path
        d="M 101.88 39.53 A 43 43 0 1 0 101.88 92.47 A 10 10 0 0 0 86.12 80.16 A 23 23 0 1 1 86.12 51.84 A 10 10 0 0 0 101.88 39.53 Z"
        fill="url(#codyExtrudeGrad)"
      />

      {/* 3D Connecting Walls */}
      <path
        d="M 101.88 86.47 L 101.88 92.47 A 43 43 0 0 1 25 66 L 25 60 A 43 43 0 0 0 101.88 86.47 Z"
        fill="url(#codyExtrudeGrad)"
      />
      <path
        d="M 101.88 86.47 A 10 10 0 0 0 86.12 74.16 L 86.12 80.16 A 10 10 0 0 1 101.88 92.47 Z"
        fill="#2A1C17"
      />

      {/* 3. Main Continuous C Body (Smooth, deliberate, continuous letter C) */}
      <path
        d="M 101.88 33.53 A 43 43 0 1 0 101.88 86.47 A 10 10 0 0 0 86.12 74.16 A 23 23 0 1 1 86.12 45.84 A 10 10 0 0 0 101.88 33.53 Z"
        fill="url(#codyMainGrad)"
      />

      {/* 4. Subtle 3D Bevel Stroke */}
      <path
        d="M 101.88 33.53 A 43 43 0 1 0 101.88 86.47 A 10 10 0 0 0 86.12 74.16 A 23 23 0 1 1 86.12 45.84 A 10 10 0 0 0 101.88 33.53 Z"
        stroke="url(#codyBevelGrad)"
        strokeWidth="1.6"
        fill="none"
      />

      {/* 5. Top Crown Specular Highlight */}
      <path
        d="M 42 21 A 40 40 0 0 1 88 22"
        stroke="url(#codyCrownGlint)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* 6. Lower Rim Soft Reflection */}
      <path
        d="M 33 68 A 40 40 0 0 0 96 85"
        stroke="#FFFDFC"
        strokeWidth="1"
        strokeLinecap="round"
        strokeOpacity="0.4"
        fill="none"
      />
    </svg>
  );
}

export const CodeVibeIcon = CodyIcon;

export interface CodyLogoProps extends CodyIconProps {
  showWordmark?: boolean;
  textClassName?: string;
}

export type CodeVibeLogoProps = CodyLogoProps;

export function CodyLogo({
  size = 32,
  variant = 'light',
  className = '',
  textClassName = '',
  showWordmark = true,
  ...iconProps
}: CodyLogoProps) {
  const isLight = variant === 'light';
  const defaultTextClass = isLight 
    ? 'font-bold text-2xl text-[#F7F4F0] tracking-wide' 
    : 'font-bold text-xl text-[#3A2722] tracking-wide';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <CodyIcon size={size} variant={variant} {...iconProps} />
      {showWordmark && (
        <span className={textClassName || defaultTextClass}>Cody</span>
      )}
    </div>
  );
}

export const CodeVibeLogo = CodyLogo;
