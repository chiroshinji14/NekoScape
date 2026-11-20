import type { SceneTheme } from '../types/simulation';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface SceneThemeDefinition {
  readonly id: SceneTheme;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly swatchColors: readonly [string, string, string];
  readonly floor: {
    readonly baseHex: string;
    readonly palette: readonly string[];
    readonly grooveHex: string;
    readonly accentHex: string;
    readonly secondaryHex: string;
    readonly sunTintRgba: readonly [string, string, string];
    readonly vignetteRgba: readonly [string, string, string];
  };
  readonly rug: {
    readonly name: string;
    readonly baseStops: readonly [string, string, string];
    readonly borderHex: string;
    readonly accentHex: string;
    readonly trimHex: string;
    readonly shadowRgb: RgbColor;
  };
  readonly mat: {
    readonly centerRgb: RgbColor;
    readonly edgeRgb: RgbColor;
    readonly borderRgb: RgbColor;
    readonly accentRgb: RgbColor;
    readonly shadowRgb: RgbColor;
    readonly nightTint: number;
    readonly nightAlpha: number;
  };
  readonly lighting: {
    readonly dayGradeTop: string;
    readonly dayGradeMid: string;
    readonly dayGradeBot: string;
    readonly dayBeamStart: string;
    readonly dayBeamMid: string;
    readonly dayBeamEnd: string;
    readonly goldenStart: string;
    readonly goldenMid: string;
    readonly goldenEdge: string;
    readonly goldenBeamStart: string;
    readonly goldenBeamMid: string;
    readonly goldenBeamEnd: string;
    readonly nightInner: string;
    readonly nightMid: string;
    readonly nightEdge: string;
    readonly nightCoolShaft: string;
    readonly nightPoolInner: string;
    readonly nightPoolMid: string;
    readonly nightPoolEdge: string;
    readonly moteTints: {
      readonly day: number;
      readonly golden: number;
      readonly night: number;
    };
    readonly moteAlphaMult: {
      readonly day: number;
      readonly golden: number;
      readonly night: number;
    };
  };
  readonly props: {
    readonly hoverRingColor: number;
    readonly activeRingColor: number;
    readonly warmGlowColor: number;
    readonly warmCoreColor: number;
    readonly shadowColor: number;
    readonly accentColor: number;
  };
}

export const SCENE_THEME_DEFS: Record<SceneTheme, SceneThemeDefinition> = {
  study: {
    id: 'study',
    label: 'Golden Study',
    shortLabel: 'Study',
    description: 'Warm honey-oak planks, cream boucle rug, stitched cork mats, and angled window sunbeams.',
    swatchColors: ['#C99768', '#EFE3D4', '#C46D53'],
    floor: {
      baseHex: '#B88354',
      palette: ['#C99768', '#B98455', '#D4A574', '#AC7749', '#B47F50'],
      grooveHex: '#5C3B22',
      accentHex: '#F6D6AE',
      secondaryHex: '#4E311D',
      sunTintRgba: [
        'rgba(255, 231, 186, 0.22)',
        'rgba(248, 206, 148, 0.08)',
        'rgba(248, 206, 148, 0)',
      ],
      vignetteRgba: [
        'rgba(38, 24, 15, 0)',
        'rgba(42, 26, 16, 0.12)',
        'rgba(30, 18, 11, 0.42)',
      ],
    },
    rug: {
      name: 'Cream Boucle Rug',
      baseStops: ['#F5ECE1', '#EFE3D4', '#E5D8C6'],
      borderHex: '#4A372B',
      accentHex: '#C46D53',
      trimHex: '#EDE1D2',
      shadowRgb: { r: 38, g: 22, b: 13 },
    },
    mat: {
      centerRgb: { r: 223, g: 203, b: 180 },
      edgeRgb: { r: 214, g: 192, b: 166 },
      borderRgb: { r: 140, g: 111, b: 86 },
      accentRgb: { r: 242, g: 227, b: 208 },
      shadowRgb: { r: 36, g: 22, b: 13 },
      nightTint: 0xc6d0e3,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 249, 232, 0.08)',
      dayGradeMid: 'rgba(255, 246, 224, 0.02)',
      dayGradeBot: 'rgba(42, 34, 28, 0.06)',
      dayBeamStart: 'rgba(255, 246, 214, 0.11)',
      dayBeamMid: 'rgba(255, 246, 214, 0.04)',
      dayBeamEnd: 'rgba(255, 246, 214, 0)',
      goldenStart: 'rgba(255, 206, 125, 0.14)',
      goldenMid: 'rgba(232, 162, 84, 0.06)',
      goldenEdge: 'rgba(44, 24, 14, 0.16)',
      goldenBeamStart: 'rgba(255, 209, 128, 0.22)',
      goldenBeamMid: 'rgba(255, 209, 128, 0.04)',
      goldenBeamEnd: 'rgba(255, 190, 96, 0)',
      nightInner: 'rgba(24, 30, 52, 0.08)',
      nightMid: 'rgba(20, 27, 49, 0.24)',
      nightEdge: 'rgba(13, 18, 36, 0.48)',
      nightCoolShaft: 'rgba(136, 168, 224, 0.09)',
      nightPoolInner: 'rgba(255, 204, 124, 0.22)',
      nightPoolMid: 'rgba(240, 166, 82, 0.11)',
      nightPoolEdge: 'rgba(240, 166, 82, 0)',
      moteTints: { day: 0xfff5dc, golden: 0xffd28a, night: 0xffbe6b },
      moteAlphaMult: { day: 0.78, golden: 1.05, night: 0.88 },
    },
    props: {
      hoverRingColor: 0xffe4b3,
      activeRingColor: 0xf4b961,
      warmGlowColor: 0xffb85c,
      warmCoreColor: 0xffe8b8,
      shadowColor: 0x24150c,
      accentColor: 0xc46d53,
    },
  },
  tatami: {
    id: 'tatami',
    label: 'Kyoto Tatami',
    shortLabel: 'Tatami',
    description: 'Woven rush-grass tatami panels, indigo-moss heri borders, quilted kotatsu mat, and shoji light.',
    swatchColors: ['#C0BA84', '#29383A', '#C65F40'],
    floor: {
      baseHex: '#B6B07B',
      palette: ['#C2BC86', '#B6B17B', '#C9C38E', '#ACA773', '#BDB782'],
      grooveHex: '#3C3F2D',
      accentHex: '#273538',
      secondaryHex: '#9C9869',
      sunTintRgba: [
        'rgba(255, 243, 210, 0.18)',
        'rgba(245, 224, 178, 0.06)',
        'rgba(245, 224, 178, 0)',
      ],
      vignetteRgba: [
        'rgba(32, 34, 24, 0)',
        'rgba(32, 35, 26, 0.12)',
        'rgba(20, 24, 20, 0.4)',
      ],
    },
    rug: {
      name: 'Quilted Kotatsu Mat',
      baseStops: ['#F1E6D6', '#E9DBC7', '#DFCEB7'],
      borderHex: '#C65F40',
      accentHex: '#2B3B40',
      trimHex: '#F3E9DB',
      shadowRgb: { r: 30, g: 24, b: 18 },
    },
    mat: {
      centerRgb: { r: 218, g: 182, b: 132 },
      edgeRgb: { r: 194, g: 155, b: 106 },
      borderRgb: { r: 112, g: 76, b: 44 },
      accentRgb: { r: 236, g: 206, b: 158 },
      shadowRgb: { r: 28, g: 24, b: 17 },
      nightTint: 0xc2cde0,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 250, 236, 0.09)',
      dayGradeMid: 'rgba(252, 244, 222, 0.03)',
      dayGradeBot: 'rgba(34, 38, 30, 0.06)',
      dayBeamStart: 'rgba(255, 248, 224, 0.14)',
      dayBeamMid: 'rgba(255, 244, 212, 0.06)',
      dayBeamEnd: 'rgba(255, 244, 212, 0)',
      goldenStart: 'rgba(255, 212, 138, 0.15)',
      goldenMid: 'rgba(229, 166, 92, 0.06)',
      goldenEdge: 'rgba(34, 28, 20, 0.16)',
      goldenBeamStart: 'rgba(255, 214, 140, 0.22)',
      goldenBeamMid: 'rgba(255, 198, 114, 0.08)',
      goldenBeamEnd: 'rgba(255, 192, 102, 0)',
      nightInner: 'rgba(24, 28, 48, 0.09)',
      nightMid: 'rgba(18, 24, 44, 0.26)',
      nightEdge: 'rgba(11, 16, 32, 0.5)',
      nightCoolShaft: 'rgba(138, 170, 220, 0.08)',
      nightPoolInner: 'rgba(255, 194, 108, 0.25)',
      nightPoolMid: 'rgba(235, 152, 72, 0.12)',
      nightPoolEdge: 'rgba(235, 152, 72, 0)',
      moteTints: { day: 0xfff6e2, golden: 0xffd796, night: 0xffc168 },
      moteAlphaMult: { day: 0.72, golden: 0.98, night: 0.92 },
    },
    props: {
      hoverRingColor: 0xf9e6bc,
      activeRingColor: 0xe6b566,
      warmGlowColor: 0xffaa4c,
      warmCoreColor: 0xffebc0,
      shadowColor: 0x1e1912,
      accentColor: 0xc65f40,
    },
  },
  garden: {
    id: 'garden',
    label: 'Sunlit Courtyard',
    shortLabel: 'Garden',
    description: 'Moss-jointed flagstones, clover and daisy courtyard lawn, stepping stones, and canopy dappled sun.',
    swatchColors: ['#9E998D', '#5E8845', '#B07D64'],
    floor: {
      baseHex: '#48603A',
      palette: ['#9E998D', '#A8A296', '#918C81', '#B07D64', '#A27058', '#956650'],
      grooveHex: '#3B5130',
      accentHex: '#64834D',
      secondaryHex: '#7A756B',
      sunTintRgba: [
        'rgba(255, 244, 204, 0.2)',
        'rgba(240, 224, 170, 0.06)',
        'rgba(240, 224, 170, 0)',
      ],
      vignetteRgba: [
        'rgba(22, 32, 18, 0)',
        'rgba(24, 34, 20, 0.13)',
        'rgba(16, 24, 14, 0.44)',
      ],
    },
    rug: {
      name: 'Clover & Daisy Lawn',
      baseStops: ['#668F4D', '#567E3F', '#486D34'],
      borderHex: '#4E7437',
      accentHex: '#F7F4EA',
      trimHex: '#E8B84B',
      shadowRgb: { r: 24, g: 34, b: 18 },
    },
    mat: {
      centerRgb: { r: 184, g: 182, b: 170 },
      edgeRgb: { r: 152, g: 154, b: 141 },
      borderRgb: { r: 86, g: 120, b: 62 },
      accentRgb: { r: 208, g: 206, b: 196 },
      shadowRgb: { r: 22, g: 30, b: 18 },
      nightTint: 0xbfd0dd,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 250, 226, 0.08)',
      dayGradeMid: 'rgba(242, 246, 220, 0.02)',
      dayGradeBot: 'rgba(24, 38, 22, 0.07)',
      dayBeamStart: 'rgba(255, 249, 210, 0.14)',
      dayBeamMid: 'rgba(248, 242, 198, 0.05)',
      dayBeamEnd: 'rgba(248, 242, 198, 0)',
      goldenStart: 'rgba(255, 212, 128, 0.15)',
      goldenMid: 'rgba(226, 172, 90, 0.06)',
      goldenEdge: 'rgba(26, 32, 18, 0.18)',
      goldenBeamStart: 'rgba(255, 218, 134, 0.24)',
      goldenBeamMid: 'rgba(255, 196, 104, 0.07)',
      goldenBeamEnd: 'rgba(255, 190, 96, 0)',
      nightInner: 'rgba(18, 28, 46, 0.1)',
      nightMid: 'rgba(14, 24, 42, 0.28)',
      nightEdge: 'rgba(9, 16, 30, 0.52)',
      nightCoolShaft: 'rgba(142, 184, 226, 0.1)',
      nightPoolInner: 'rgba(255, 212, 132, 0.2)',
      nightPoolMid: 'rgba(226, 172, 92, 0.09)',
      nightPoolEdge: 'rgba(226, 172, 92, 0)',
      moteTints: { day: 0xf8f6d6, golden: 0xffe08e, night: 0xe2f56b },
      moteAlphaMult: { day: 0.82, golden: 1.06, night: 1.48 },
    },
    props: {
      hoverRingColor: 0xebf5d6,
      activeRingColor: 0x86d492,
      warmGlowColor: 0xffcb6b,
      warmCoreColor: 0xfff0c2,
      shadowColor: 0x182214,
      accentColor: 0x6ca86a,
    },
  },
  cafe: {
    id: 'cafe',
    label: 'Cat Cafe Tile',
    shortLabel: 'Cafe',
    description: 'Cream travertine and terracotta checkerboard, sage-velvet lounge mat, terrazzo coasters, and pendant pools.',
    swatchColors: ['#DFD1BD', '#BC785E', '#768F77'],
    floor: {
      baseHex: '#715B4C',
      palette: ['#DFD1BD', '#E5D8C5', '#D7C8B3', '#BC785E', '#B47056', '#C48167'],
      grooveHex: '#6E5849',
      accentHex: '#F3EAE0',
      secondaryHex: '#9A634E',
      sunTintRgba: [
        'rgba(255, 238, 208, 0.18)',
        'rgba(248, 218, 172, 0.06)',
        'rgba(248, 218, 172, 0)',
      ],
      vignetteRgba: [
        'rgba(40, 26, 18, 0)',
        'rgba(38, 24, 16, 0.12)',
        'rgba(26, 16, 11, 0.42)',
      ],
    },
    rug: {
      name: 'Sage Velvet Lounge Mat',
      baseStops: ['#7E967E', '#6E866F', '#5F7760'],
      borderHex: '#4B604C',
      accentHex: '#F4EBDD',
      trimHex: '#DFC7A0',
      shadowRgb: { r: 34, g: 22, b: 14 },
    },
    mat: {
      centerRgb: { r: 236, g: 227, b: 212 },
      edgeRgb: { r: 222, g: 211, b: 194 },
      borderRgb: { r: 168, g: 138, b: 108 },
      accentRgb: { r: 248, g: 242, b: 232 },
      shadowRgb: { r: 34, g: 22, b: 14 },
      nightTint: 0xc9d0e0,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 248, 234, 0.08)',
      dayGradeMid: 'rgba(255, 244, 224, 0.02)',
      dayGradeBot: 'rgba(46, 32, 24, 0.06)',
      dayBeamStart: 'rgba(255, 246, 222, 0.12)',
      dayBeamMid: 'rgba(255, 244, 214, 0.04)',
      dayBeamEnd: 'rgba(255, 244, 214, 0)',
      goldenStart: 'rgba(255, 210, 140, 0.14)',
      goldenMid: 'rgba(232, 168, 96, 0.06)',
      goldenEdge: 'rgba(42, 24, 16, 0.16)',
      goldenBeamStart: 'rgba(255, 214, 142, 0.21)',
      goldenBeamMid: 'rgba(255, 198, 114, 0.05)',
      goldenBeamEnd: 'rgba(255, 192, 104, 0)',
      nightInner: 'rgba(26, 24, 42, 0.09)',
      nightMid: 'rgba(22, 22, 40, 0.26)',
      nightEdge: 'rgba(14, 14, 28, 0.5)',
      nightCoolShaft: 'rgba(146, 168, 214, 0.07)',
      nightPoolInner: 'rgba(255, 206, 130, 0.24)',
      nightPoolMid: 'rgba(242, 168, 86, 0.12)',
      nightPoolEdge: 'rgba(242, 168, 86, 0)',
      moteTints: { day: 0xfff5e0, golden: 0xffd592, night: 0xffc472 },
      moteAlphaMult: { day: 0.76, golden: 1.02, night: 0.9 },
    },
    props: {
      hoverRingColor: 0xfaebd2,
      activeRingColor: 0xe8946e,
      warmGlowColor: 0xffbc68,
      warmCoreColor: 0xffead0,
      shadowColor: 0x261810,
      accentColor: 0xd47b5c,
    },
  },
};

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function shiftHexColor(hex: string, delta: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(delta * 0.85)));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(delta * 0.72)));
  return `rgb(${r}, ${g}, ${b})`;
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
