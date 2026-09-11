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
        {/* Soft ambient floor shadow filter */}
        <filter id="codyFloorBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
        
        {/* Core contact shadow filter */}
        <filter id="codyContactBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
        </filter>

        {/* Subtle specular edge highlight filter */}
        <filter id="codyGlintFilter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Clip path for upper half (y <= 56.5) */}
        <clipPath id="codyUpperClip">
          <rect x="0" y="0" width="128" height="56.5" />
        </clipPath>

        {/* Clip path for lower half (y >= 56.5) */}
        <clipPath id="codyLowerClip">
          <rect x="0" y="56.5" width="128" height="71.5" />
        </clipPath>

        {/* Floor shadow: subtle deep warm-brown shadow for natural grounding (#241713) */}
        <radialGradient id="codyFloorShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#241713" stopOpacity="0.48" />
          <stop offset="60%" stopColor="#241713" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#241713" stopOpacity="0" />
        </radialGradient>

        {/* Upper Half: Warm Ivory (Base: #F4EFE8, Highlights: #FFFDFC) */}
        <linearGradient id="codyIvoryBase" x1="35%" y1="5%" x2="65%" y2="100%">
          <stop offset="0%" stopColor="#FFFDFC" />
          <stop offset="25%" stopColor="#F8F4EE" />
          <stop offset="60%" stopColor="#F4EFE8" />
          <stop offset="85%" stopColor="#EAE3D9" />
          <stop offset="100%" stopColor="#DFD7CC" />
        </linearGradient>

        {/* Upper Half: Realistic 3D Bevel & Curvature Shade */}
        <linearGradient id="codyIvoryBevel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#FFFDFC" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#C8C0B7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9E9488" stopOpacity="0.55" />
        </linearGradient>

        {/* Upper Crown Specular Glint (#FFFDFC) */}
        <linearGradient id="codyCrownGlint" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0" />
          <stop offset="30%" stopColor="#FFFDFC" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#FFFDFC" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFFDFC" stopOpacity="0" />
        </linearGradient>

        {/* Upper Arch Soft Ivory Highlight */}
        <linearGradient id="codyUpperHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#F4EFE8" stopOpacity="0.05" />
        </linearGradient>

        {/* Top Terminal Cap Warm Ivory Radial Highlight */}
        <radialGradient id="codyTopCapHighlight" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#F4EFE8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#E2D9CE" stopOpacity="0.2" />
        </radialGradient>

        {/* Lower Half: Muted Champagne / Neutral Silver (Base: #C8C0B7, Highlights: #E5DED6) */}
        <linearGradient id="codyChampagneBase" x1="25%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#E5DED6" />
          <stop offset="25%" stopColor="#D9D1C8" />
          <stop offset="60%" stopColor="#C8C0B7" />
          <stop offset="85%" stopColor="#BCB3A9" />
          <stop offset="100%" stopColor="#CCC4BA" />
        </linearGradient>

        {/* Lower Half: Brushed Subtle Linear Sheen */}
        <linearGradient id="codyChampagneSheen" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.35" />
          <stop offset="35%" stopColor="#E5DED6" stopOpacity="0.15" />
          <stop offset="55%" stopColor="#A89F94" stopOpacity="0.22" />
          <stop offset="75%" stopColor="#FFFDFC" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#A89F94" stopOpacity="0.15" />
        </linearGradient>

        {/* Lower Champagne Silver 3D Bevel Edge */}
        <linearGradient id="codyChampagneBevel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.85" />
          <stop offset="35%" stopColor="#E5DED6" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#8E8478" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#E5DED6" stopOpacity="0.8" />
        </linearGradient>

        {/* Lower Bottom Rim Champagne Glint */}
        <linearGradient id="codyBottomRimGlint" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#E5DED6" stopOpacity="0" />
          <stop offset="40%" stopColor="#FFFDFC" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#E5DED6" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#FFFDFC" stopOpacity="0" />
        </linearGradient>

        {/* Bottom Terminal Cap Champagne Reflection */}
        <radialGradient id="codyBottomCapReflection" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFFDFC" stopOpacity="0.9" />
          <stop offset="35%" stopColor="#E5DED6" stopOpacity="0.75" />
          <stop offset="70%" stopColor="#C8C0B7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#9E9488" stopOpacity="0.1" />
        </radialGradient>

        {/* 3D Extrusion Side Wall: Deep Warm-Brown Shadow Depth (#241713 tone) */}
        <linearGradient id="codyExtrusionOuterWall" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#483730" />
          <stop offset="30%" stopColor="#32251F" />
          <stop offset="55%" stopColor="#241713" />
          <stop offset="80%" stopColor="#2E221C" />
          <stop offset="100%" stopColor="#3E2E28" />
        </linearGradient>

        {/* 3D Extrusion Cap Wall: Deep Warm Shadow Depth */}
        <linearGradient id="codyExtrusionCapWall" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#32251F" />
          <stop offset="60%" stopColor="#241713" />
          <stop offset="100%" stopColor="#1C120F" />
        </linearGradient>

        {/* Inner Hole Deep Warm Ambient Occlusion Depth */}
        <linearGradient id="codyInnerHoleAO" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#241713" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#2E221C" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#1C120F" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 1. Ambient & Contact Floor Shadows (Deep warm-brown #241713) */}
      <ellipse cx="64" cy="104" rx="44" ry="8.5" fill="url(#codyFloorShadow)" filter="url(#codyFloorBlur)" />
      <ellipse cx="62" cy="96" rx="34" ry="4.5" fill="#241713" opacity="0.45" filter="url(#codyContactBlur)" />

      {/* 2. 3D Extrusion Sides (Depth & Thickness - 8px Projection) */}
      <path
        d="M 98.67 36.91 A 44 44 0 1 0 98.67 91.09 A 10 10 0 0 1 82.91 78.78 A 24 24 0 1 1 82.91 49.22 A 10 10 0 0 1 98.67 36.91 Z"
        fill="#241713"
      />
      <path
        d="M 20 56 A 44 44 0 0 0 98.67 83.09 L 98.67 91.09 A 44 44 0 0 1 20 64 Z"
        fill="url(#codyExtrusionOuterWall)"
      />
      <path
        d="M 98.67 83.09 A 10 10 0 0 1 82.91 70.78 L 82.91 78.78 A 10 10 0 0 0 98.67 91.09 Z"
        fill="url(#codyExtrusionCapWall)"
      />
      <path
        d="M 40 56 A 24 24 0 0 1 82.91 41.22 L 82.91 47.22 A 24 24 0 0 0 40 62 Z"
        fill="url(#codyInnerHoleAO)"
      />

      {/* 3. Lower Half: Muted Champagne / Neutral Silver (y >= 56.5) */}
      <g clipPath="url(#codyLowerClip)">
        <path
          d="M 98.67 28.91 A 44 44 0 1 0 98.67 83.09 A 10 10 0 0 1 82.91 70.78 A 24 24 0 1 1 82.91 41.22 A 10 10 0 0 1 98.67 28.91 Z"
          fill="url(#codyChampagneBase)"
        />
        <path
          d="M 98.67 28.91 A 44 44 0 1 0 98.67 83.09 A 10 10 0 0 1 82.91 70.78 A 24 24 0 1 1 82.91 41.22 A 10 10 0 0 1 98.67 28.91 Z"
          fill="url(#codyChampagneSheen)"
          opacity="0.65"
        />
        <path
          d="M 98.67 28.91 A 44 44 0 1 0 98.67 83.09 A 10 10 0 0 1 82.91 70.78 A 24 24 0 1 1 82.91 41.22 A 10 10 0 0 1 98.67 28.91 Z"
          stroke="url(#codyChampagneBevel)"
          strokeWidth="1.8"
          fill="none"
        />
        <path
          d="M 23.5 61 A 42 42 0 0 0 95 82.5"
          stroke="url(#codyBottomRimGlint)"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
          filter="url(#codyGlintFilter)"
        />
        <circle cx="90.79" cy="76.93" r="5.5" fill="url(#codyBottomCapReflection)" />
        <circle cx="89.5" cy="75.5" r="1.8" fill="#FFFDFC" opacity="0.85" />
      </g>

      {/* 4. Upper Half: Warm Ivory (y <= 56.5) */}
      <g clipPath="url(#codyUpperClip)">
        <path
          d="M 98.67 28.91 A 44 44 0 1 0 98.67 83.09 A 10 10 0 0 1 82.91 70.78 A 24 24 0 1 1 82.91 41.22 A 10 10 0 0 1 98.67 28.91 Z"
          fill="url(#codyIvoryBase)"
        />
        <path
          d="M 98.67 28.91 A 44 44 0 1 0 98.67 83.09 A 10 10 0 0 1 82.91 70.78 A 24 24 0 1 1 82.91 41.22 A 10 10 0 0 1 98.67 28.91 Z"
          stroke="url(#codyIvoryBevel)"
          strokeWidth="1.8"
          fill="none"
        />
        <path
          d="M 33 42 C 34 26, 52 16, 75 16 C 85 16, 92 19, 94 22 C 86 21, 65 24, 46 34 C 38 39, 34 42, 33 42 Z"
          fill="url(#codyUpperHighlight)"
        />
        <path
          d="M 42 16.5 A 41 41 0 0 1 86 18"
          stroke="url(#codyCrownGlint)"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          filter="url(#codyGlintFilter)"
        />
        <circle cx="90.79" cy="35.07" r="5.5" fill="url(#codyTopCapHighlight)" />
        <circle cx="89.5" cy="33.5" r="1.6" fill="#FFFDFC" opacity="0.9" />
      </g>

      {/* 5. Transition Seam (y = 56.5) */}
      <line x1="20" y1="55.8" x2="40" y2="55.8" stroke="#C8C0B7" strokeWidth="0.8" opacity="0.45" />
      <line x1="20" y1="56.5" x2="40" y2="56.5" stroke="#FFFDFC" strokeWidth="0.9" opacity="0.95" />
      <line x1="20" y1="57.3" x2="40" y2="57.3" stroke="#9E9488" strokeWidth="0.5" opacity="0.45" />
      <circle cx="20" cy="56.5" r="1" fill="#E5DED6" opacity="0.9" />
      <circle cx="40" cy="56.5" r="1" fill="#E5DED6" opacity="0.9" />
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
