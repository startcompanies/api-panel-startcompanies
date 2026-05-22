export const BRAND_PALETTE_IDS = [
  'blue',
  'teal',
  'green',
  'indigo',
  'amber',
  'slate',
  'custom',
] as const;

export type BrandPaletteId = (typeof BRAND_PALETTE_IDS)[number];

export const SHELL_APPEARANCE_IDS = ['light', 'dark'] as const;

export type ShellAppearanceId = (typeof SHELL_APPEARANCE_IDS)[number];

export const DEFAULT_BRAND_PALETTE: BrandPaletteId = 'blue';
export const DEFAULT_SHELL_APPEARANCE: ShellAppearanceId = 'dark';

export interface TenantThemeTokens {
  primary: string;
  secondary: string;
  accent: string;
  sidebarBg: string;
  topbarBg: string;
  sidebarBorder: string;
  workspaceBg: string;
  authGradientFrom: string;
  authGradientMid: string;
  authGradientTo: string;
  authGlow: string;
  panelBrandPrimary: string;
  panelBrandCyan: string;
}

interface PaletteBase {
  primary: string;
  secondary: string;
  accent: string;
}

type PresetShellMap = Record<ShellAppearanceId, PaletteBase>;

export const PRESET_PALETTE_BASE: Record<
  Exclude<BrandPaletteId, 'custom'>,
  PresetShellMap
> = {
  blue: {
    light: { primary: '#0068BD', secondary: '#006AFE', accent: '#01C9E2' },
    dark: { primary: '#0068BD', secondary: '#006AFE', accent: '#01C9E2' },
  },
  teal: {
    light: { primary: '#0D9488', secondary: '#14B8A6', accent: '#2DD4BF' },
    dark: { primary: '#0F766E', secondary: '#14B8A6', accent: '#5EEAD4' },
  },
  green: {
    light: { primary: '#059669', secondary: '#10B981', accent: '#34D399' },
    dark: { primary: '#047857', secondary: '#10B981', accent: '#6EE7B7' },
  },
  indigo: {
    light: { primary: '#4F46E5', secondary: '#6366F1', accent: '#818CF8' },
    dark: { primary: '#4338CA', secondary: '#6366F1', accent: '#A5B4FC' },
  },
  amber: {
    light: { primary: '#D97706', secondary: '#F59E0B', accent: '#FBBF24' },
    dark: { primary: '#B45309', secondary: '#F59E0B', accent: '#FCD34D' },
  },
  slate: {
    light: { primary: '#475569', secondary: '#64748B', accent: '#0068BD' },
    dark: { primary: '#334155', secondary: '#64748B', accent: '#38BDF8' },
  },
};
