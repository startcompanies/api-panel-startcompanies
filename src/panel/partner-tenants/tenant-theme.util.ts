import {
  BrandPaletteId,
  DEFAULT_BRAND_PALETTE,
  DEFAULT_SHELL_APPEARANCE,
  PRESET_PALETTE_BASE,
  ShellAppearanceId,
  TenantThemeTokens,
} from './constants/brand-palette.constants';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export interface ResolveTenantThemeInput {
  brandPalette?: string | null;
  shellAppearance?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = HEX_COLOR.exec(hex.trim());
  if (!m) {
    return null;
  }
  const h = hex.trim().slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mix(hex1: string, hex2: string, weight2: number): string {
  const a = parseHex(hex1);
  const b = parseHex(hex2);
  if (!a || !b) {
    return hex1;
  }
  const w = clamp(weight2, 0, 1);
  return toHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w,
  );
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#FFFFFF', amount);
}

function alpha(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${a})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(a, 0, 1)})`;
}

export function normalizeBrandPalette(raw?: string | null): BrandPaletteId {
  const v = (raw || '').trim().toLowerCase();
  if (
    v === 'blue' ||
    v === 'teal' ||
    v === 'green' ||
    v === 'indigo' ||
    v === 'amber' ||
    v === 'slate' ||
    v === 'custom'
  ) {
    return v;
  }
  return DEFAULT_BRAND_PALETTE;
}

export function normalizeShellAppearance(raw?: string | null): ShellAppearanceId {
  const v = (raw || '').trim().toLowerCase();
  return v === 'light' ? 'light' : DEFAULT_SHELL_APPEARANCE;
}

function resolveBaseColors(input: ResolveTenantThemeInput): {
  primary: string;
  secondary: string;
  accent: string;
} {
  const palette = normalizeBrandPalette(input.brandPalette);
  const shell = normalizeShellAppearance(input.shellAppearance);

  if (palette === 'custom') {
    const primary = input.primaryColor?.trim() || '#0068BD';
    const secondary = input.secondaryColor?.trim() || lighten(primary, 0.25);
    const accent = input.accentColor?.trim() || secondary;
    return { primary, secondary, accent };
  }

  const base = PRESET_PALETTE_BASE[palette][shell];
  return { primary: base.primary, secondary: base.secondary, accent: base.accent };
}

export function resolveTenantThemeTokens(
  input: ResolveTenantThemeInput,
): TenantThemeTokens {
  const shell = normalizeShellAppearance(input.shellAppearance);
  const { primary, secondary, accent } = resolveBaseColors(input);

  if (shell === 'light') {
    return {
      primary,
      secondary,
      accent,
      sidebarBg: lighten(primary, 0.92),
      topbarBg: '#FFFFFF',
      sidebarBorder: mix(primary, '#E2E8F0', 0.35),
      workspaceBg: '#F4F7FB',
      authGradientFrom: lighten(primary, 0.55),
      authGradientMid: lighten(secondary, 0.45),
      authGradientTo: lighten(accent, 0.35),
      authGlow: alpha(accent, 0.2),
      panelBrandPrimary: primary,
      panelBrandCyan: accent,
    };
  }

  return {
    primary,
    secondary,
    accent,
    sidebarBg: darken(primary, 0.72),
    topbarBg: darken(primary, 0.65),
    sidebarBorder: mix(primary, '#1A3354', 0.45),
    workspaceBg: '#F4F7FB',
    authGradientFrom: darken(primary, 0.78),
    authGradientMid: darken(primary, 0.55),
    authGradientTo: darken(secondary, 0.35),
    authGlow: alpha(accent, 0.12),
    panelBrandPrimary: secondary,
    panelBrandCyan: accent,
  };
}

export function resolvedPublicColors(
  input: ResolveTenantThemeInput,
): { primaryColor: string; secondaryColor: string; accentColor: string } {
  const tokens = resolveTenantThemeTokens(input);
  return {
    primaryColor: tokens.primary,
    secondaryColor: tokens.secondary,
    accentColor: tokens.accent,
  };
}

export function assertCustomPaletteColors(
  palette: BrandPaletteId,
  primary?: string | null,
): void {
  if (palette !== 'custom') {
    return;
  }
  if (!primary?.trim() || !HEX_COLOR.test(primary.trim())) {
    throw new Error('CUSTOM_PRIMARY_REQUIRED');
  }
}
