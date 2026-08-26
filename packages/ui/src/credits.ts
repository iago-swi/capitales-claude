import type { Lang } from '@capitales/core';

/**
 * Who worked on this, for the screen hidden behind seven presses on the logo.
 *
 * Photos are data URIs rather than files. Every build has to work with no
 * network — the APK and the single HTML file have nowhere to fetch from — so
 * the portrait travels inside the bundle or not at all. Keep them square and
 * small: 160x160 WebP lands around 12 kB each, and the single-file build is
 * 818 kB, so a handful is fine and a crowd is not.
 *
 * `photo: null` falls back to the initials, so an entry can be added before its
 * portrait exists without the screen looking broken.
 */
export interface Credit {
  name: string;
  /** What they did, in both languages. */
  role: Record<Lang, string>;
  /** The line that makes it worth hiding. */
  quip: Record<Lang, string>;
  /** Square portrait as a data URI, or null for initials. */
  photo: string | null;
}

/** First letters of the first two words, for the fallback disc. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const CREDITS: Credit[] = [
  {
    name: 'Philippe Noth',
    role: {
      en: 'Idea, design, and the original from thirty years ago',
      fr: 'Idée, conception, et l’original d’il y a trente ans',
    },
    quip: {
      en: 'Wrote the first one in Visual Basic and never quite let it go.',
      fr: 'A écrit le premier en Visual Basic et ne s’en est jamais remis.',
    },
    photo: null,
  },
  {
    name: 'Claude',
    role: {
      en: 'Code, cartography, and three attempts at the scoring',
      fr: 'Code, cartographie, et trois essais de barème',
    },
    quip: {
      en: 'Calibrated the penalty in kilometres nobody could reach. Twice.',
      fr: 'A calibré la pénalité en kilomètres hors de l’écran. Deux fois.',
    },
    photo: null,
  },
];
