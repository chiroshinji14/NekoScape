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
    description: 'Warm honey-oak planks, cream boucle rug, bookshelf nook, and angled window sunbeams.',
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
    label: 'Sunlit Garden',
    shortLabel: 'Garden',
    description: 'Moss-jointed flagstones, clover lawn, lush drinkable koi pond, and dappled canopy sun.',
    swatchColors: ['#9E998D', '#5E8845', '#3A827A'],
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
    label: 'Cat Cafe',
    shortLabel: 'Cafe',
    description: 'Cream travertine and terracotta checkerboard, sage-velvet lounge mat, cat tree, and fountain.',
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
  living_room: {
    id: 'living_room',
    label: 'Living Room',
    shortLabel: 'Living',
    description: 'Walnut herringbone parquet, crimson Persian medallion rug, crackling fireplace, and warm laptop.',
    swatchColors: ['#8C5D3B', '#A94B3A', '#EBD8C3'],
    floor: {
      baseHex: '#7A4F32',
      palette: ['#8C5D3B', '#7F5234', '#976846', '#72472B', '#855737'],
      grooveHex: '#432817',
      accentHex: '#CFA076',
      secondaryHex: '#5B3720',
      sunTintRgba: [
        'rgba(255, 224, 174, 0.2)',
        'rgba(245, 192, 132, 0.08)',
        'rgba(245, 192, 132, 0)',
      ],
      vignetteRgba: [
        'rgba(28, 16, 10, 0)',
        'rgba(32, 18, 11, 0.14)',
        'rgba(20, 11, 7, 0.46)',
      ],
    },
    rug: {
      name: 'Persian Medallion Rug',
      baseStops: ['#AC4A3A', '#9A3F30', '#873426'],
      borderHex: '#2C3848',
      accentHex: '#EAD7BD',
      trimHex: '#F0E3D0',
      shadowRgb: { r: 28, g: 15, b: 10 },
    },
    mat: {
      centerRgb: { r: 222, g: 196, b: 170 },
      edgeRgb: { r: 204, g: 174, b: 146 },
      borderRgb: { r: 126, g: 76, b: 56 },
      accentRgb: { r: 244, g: 226, b: 204 },
      shadowRgb: { r: 26, g: 15, b: 10 },
      nightTint: 0xc2c8dc,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 246, 228, 0.07)',
      dayGradeMid: 'rgba(255, 240, 214, 0.02)',
      dayGradeBot: 'rgba(38, 24, 18, 0.07)',
      dayBeamStart: 'rgba(255, 244, 212, 0.12)',
      dayBeamMid: 'rgba(255, 240, 206, 0.04)',
      dayBeamEnd: 'rgba(255, 240, 206, 0)',
      goldenStart: 'rgba(255, 198, 120, 0.16)',
      goldenMid: 'rgba(232, 148, 76, 0.07)',
      goldenEdge: 'rgba(38, 18, 10, 0.18)',
      goldenBeamStart: 'rgba(255, 202, 120, 0.22)',
      goldenBeamMid: 'rgba(244, 166, 86, 0.06)',
      goldenBeamEnd: 'rgba(244, 166, 86, 0)',
      nightInner: 'rgba(22, 22, 42, 0.1)',
      nightMid: 'rgba(18, 19, 38, 0.28)',
      nightEdge: 'rgba(10, 12, 26, 0.54)',
      nightCoolShaft: 'rgba(128, 158, 214, 0.08)',
      nightPoolInner: 'rgba(255, 166, 84, 0.26)',
      nightPoolMid: 'rgba(232, 124, 52, 0.12)',
      nightPoolEdge: 'rgba(232, 124, 52, 0)',
      moteTints: { day: 0xfff4da, golden: 0xffc67c, night: 0xff9d52 },
      moteAlphaMult: { day: 0.78, golden: 1.04, night: 0.96 },
    },
    props: {
      hoverRingColor: 0xffdfad,
      activeRingColor: 0xf08c54,
      warmGlowColor: 0xff9248,
      warmCoreColor: 0xffdfa8,
      shadowColor: 0x1c1009,
      accentColor: 0xc25943,
    },
  },
  rainy_window: {
    id: 'rainy_window',
    label: 'Rainy Window',
    shortLabel: 'Rainy',
    description: 'Misty slate-ash oak planks, braided sage wool rug, rain-streaked glass, and warm candle.',
    swatchColors: ['#6E7780', '#879898', '#E2C98A'],
    floor: {
      baseHex: '#5D666F',
      palette: ['#6E7780', '#636C75', '#78818B', '#58616A', '#69727B'],
      grooveHex: '#3B4249',
      accentHex: '#9EAAB6',
      secondaryHex: '#464E56',
      sunTintRgba: [
        'rgba(186, 214, 238, 0.2)',
        'rgba(154, 184, 210, 0.08)',
        'rgba(154, 184, 210, 0)',
      ],
      vignetteRgba: [
        'rgba(22, 28, 36, 0)',
        'rgba(20, 26, 34, 0.14)',
        'rgba(12, 16, 24, 0.45)',
      ],
    },
    rug: {
      name: 'Braided Sage Wool Rug',
      baseStops: ['#92A3A0', '#819390', '#708280'],
      borderHex: '#4E5E5C',
      accentHex: '#EAE6DC',
      trimHex: '#C6D0CC',
      shadowRgb: { r: 22, g: 28, b: 34 },
    },
    mat: {
      centerRgb: { r: 194, g: 204, b: 208 },
      edgeRgb: { r: 168, g: 180, b: 186 },
      borderRgb: { r: 96, g: 112, b: 120 },
      accentRgb: { r: 222, g: 230, b: 234 },
      shadowRgb: { r: 18, g: 24, b: 30 },
      nightTint: 0xb8cade,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(196, 218, 240, 0.14)',
      dayGradeMid: 'rgba(176, 198, 220, 0.06)',
      dayGradeBot: 'rgba(26, 34, 46, 0.12)',
      dayBeamStart: 'rgba(204, 228, 248, 0.18)',
      dayBeamMid: 'rgba(180, 208, 232, 0.06)',
      dayBeamEnd: 'rgba(180, 208, 232, 0)',
      goldenStart: 'rgba(198, 206, 224, 0.14)',
      goldenMid: 'rgba(152, 168, 194, 0.08)',
      goldenEdge: 'rgba(24, 30, 44, 0.22)',
      goldenBeamStart: 'rgba(210, 222, 240, 0.16)',
      goldenBeamMid: 'rgba(172, 188, 212, 0.05)',
      goldenBeamEnd: 'rgba(172, 188, 212, 0)',
      nightInner: 'rgba(18, 26, 44, 0.14)',
      nightMid: 'rgba(14, 22, 38, 0.32)',
      nightEdge: 'rgba(8, 13, 26, 0.56)',
      nightCoolShaft: 'rgba(144, 188, 236, 0.13)',
      nightPoolInner: 'rgba(255, 202, 122, 0.24)',
      nightPoolMid: 'rgba(232, 158, 76, 0.11)',
      nightPoolEdge: 'rgba(232, 158, 76, 0)',
      moteTints: { day: 0xd6ecff, golden: 0xffe4b8, night: 0xffc472 },
      moteAlphaMult: { day: 0.68, golden: 0.85, night: 0.88 },
    },
    props: {
      hoverRingColor: 0xd2ecff,
      activeRingColor: 0x8cc2e8,
      warmGlowColor: 0xffb866,
      warmCoreColor: 0xffe9c2,
      shadowColor: 0x161e26,
      accentColor: 0x7daec9,
    },
  },
  night_balcony: {
    id: 'night_balcony',
    label: 'Night Balcony',
    shortLabel: 'Balcony',
    description: 'Moonlit weathered cedar decking, indigo terrace runner, city bokeh lights, and night moths.',
    swatchColors: ['#463832', '#3F4F66', '#F4C668'],
    floor: {
      baseHex: '#322824',
      palette: ['#463832', '#3E312C', '#4D3F38', '#362B26', '#42352F'],
      grooveHex: '#1D1613',
      accentHex: '#7A6860',
      secondaryHex: '#28201C',
      sunTintRgba: [
        'rgba(164, 192, 238, 0.16)',
        'rgba(122, 152, 206, 0.06)',
        'rgba(122, 152, 206, 0)',
      ],
      vignetteRgba: [
        'rgba(12, 16, 28, 0)',
        'rgba(10, 14, 26, 0.18)',
        'rgba(6, 9, 18, 0.54)',
      ],
    },
    rug: {
      name: 'Indigo Terrace Runner',
      baseStops: ['#47566C', '#3B485C', '#303B4D'],
      borderHex: '#C66A4A',
      accentHex: '#E8D5B8',
      trimHex: '#D8B37C',
      shadowRgb: { r: 10, g: 12, b: 20 },
    },
    mat: {
      centerRgb: { r: 152, g: 162, b: 178 },
      edgeRgb: { r: 122, g: 132, b: 150 },
      borderRgb: { r: 72, g: 84, b: 106 },
      accentRgb: { r: 192, g: 202, b: 218 },
      shadowRgb: { r: 10, g: 12, b: 18 },
      nightTint: 0xd0dcf0,
      nightAlpha: 0.96,
    },
    lighting: {
      dayGradeTop: 'rgba(182, 204, 240, 0.08)',
      dayGradeMid: 'rgba(130, 152, 198, 0.04)',
      dayGradeBot: 'rgba(16, 20, 36, 0.18)',
      dayBeamStart: 'rgba(192, 214, 248, 0.12)',
      dayBeamMid: 'rgba(156, 184, 228, 0.05)',
      dayBeamEnd: 'rgba(156, 184, 228, 0)',
      goldenStart: 'rgba(244, 178, 128, 0.14)',
      goldenMid: 'rgba(132, 118, 176, 0.08)',
      goldenEdge: 'rgba(14, 16, 32, 0.28)',
      goldenBeamStart: 'rgba(255, 194, 134, 0.18)',
      goldenBeamMid: 'rgba(176, 138, 186, 0.05)',
      goldenBeamEnd: 'rgba(176, 138, 186, 0)',
      nightInner: 'rgba(14, 20, 42, 0.14)',
      nightMid: 'rgba(10, 16, 36, 0.3)',
      nightEdge: 'rgba(6, 10, 24, 0.56)',
      nightCoolShaft: 'rgba(156, 192, 246, 0.14)',
      nightPoolInner: 'rgba(255, 204, 116, 0.24)',
      nightPoolMid: 'rgba(236, 160, 74, 0.11)',
      nightPoolEdge: 'rgba(236, 160, 74, 0)',
      moteTints: { day: 0xd8e8ff, golden: 0xffd28e, night: 0xffe084 },
      moteAlphaMult: { day: 0.85, golden: 1.05, night: 1.32 },
    },
    props: {
      hoverRingColor: 0xffe49e,
      activeRingColor: 0xf4b45c,
      warmGlowColor: 0xffb856,
      warmCoreColor: 0xffe9b0,
      shadowColor: 0x0c0e16,
      accentColor: 0xe69f56,
    },
  },
  kitchen: {
    id: 'kitchen',
    label: 'Sunny Kitchen',
    shortLabel: 'Kitchen',
    description: 'Warm cream and sage ceramic tiles, braided jute runner, fridge lookout, and herb pots.',
    swatchColors: ['#ECE4D6', '#98AB92', '#D4BA90'],
    floor: {
      baseHex: '#9A8D7B',
      palette: ['#EFE8DA', '#E7DFD0', '#F4EEE2', '#97AB91', '#8C9F86', '#A3B59C'],
      grooveHex: '#847868',
      accentHex: '#C67B5A',
      secondaryHex: '#C7B8A2',
      sunTintRgba: [
        'rgba(255, 246, 214, 0.24)',
        'rgba(250, 232, 182, 0.08)',
        'rgba(250, 232, 182, 0)',
      ],
      vignetteRgba: [
        'rgba(40, 32, 22, 0)',
        'rgba(38, 30, 20, 0.1)',
        'rgba(26, 20, 14, 0.36)',
      ],
    },
    rug: {
      name: 'Braided Jute & Sage Runner',
      baseStops: ['#DEC69C', '#D2B88C', '#C4A87B'],
      borderHex: '#7A9276',
      accentHex: '#F4EDE0',
      trimHex: '#BA9B6B',
      shadowRgb: { r: 38, g: 30, b: 18 },
    },
    mat: {
      centerRgb: { r: 238, g: 229, b: 214 },
      edgeRgb: { r: 222, g: 210, b: 192 },
      borderRgb: { r: 146, g: 148, b: 122 },
      accentRgb: { r: 250, g: 244, b: 234 },
      shadowRgb: { r: 34, g: 26, b: 18 },
      nightTint: 0xc9d2df,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 251, 238, 0.1)',
      dayGradeMid: 'rgba(255, 248, 228, 0.03)',
      dayGradeBot: 'rgba(42, 36, 26, 0.05)',
      dayBeamStart: 'rgba(255, 250, 224, 0.16)',
      dayBeamMid: 'rgba(255, 244, 212, 0.05)',
      dayBeamEnd: 'rgba(255, 244, 212, 0)',
      goldenStart: 'rgba(255, 218, 148, 0.14)',
      goldenMid: 'rgba(236, 178, 106, 0.06)',
      goldenEdge: 'rgba(42, 28, 18, 0.14)',
      goldenBeamStart: 'rgba(255, 216, 144, 0.22)',
      goldenBeamMid: 'rgba(255, 198, 118, 0.06)',
      goldenBeamEnd: 'rgba(255, 198, 118, 0)',
      nightInner: 'rgba(24, 28, 46, 0.09)',
      nightMid: 'rgba(20, 25, 42, 0.24)',
      nightEdge: 'rgba(12, 16, 30, 0.48)',
      nightCoolShaft: 'rgba(146, 178, 224, 0.08)',
      nightPoolInner: 'rgba(255, 214, 146, 0.2)',
      nightPoolMid: 'rgba(240, 176, 98, 0.09)',
      nightPoolEdge: 'rgba(240, 176, 98, 0)',
      moteTints: { day: 0xfff8e4, golden: 0xffdca0, night: 0xffcb82 },
      moteAlphaMult: { day: 0.72, golden: 0.95, night: 0.84 },
    },
    props: {
      hoverRingColor: 0xfff2d2,
      activeRingColor: 0x86ba7c,
      warmGlowColor: 0xffca76,
      warmCoreColor: 0xfff1cc,
      shadowColor: 0x261d14,
      accentColor: 0x89aa7f,
    },
  },
  bedroom: {
    id: 'bedroom',
    label: 'Cozy Bedroom',
    shortLabel: 'Bedroom',
    description: 'Pale birch planks, quilted dusty-rose bed throw, mysterious blanket lump, and corner litter box.',
    swatchColors: ['#D7BA97', '#DFC8C3', '#F4EDE4'],
    floor: {
      baseHex: '#C6A782',
      palette: ['#D7BA97', '#CEB08D', '#DFC4A2', '#C5A683', '#D2B491'],
      grooveHex: '#84694B',
      accentHex: '#F3DFC5',
      secondaryHex: '#9C7E5C',
      sunTintRgba: [
        'rgba(255, 240, 212, 0.2)',
        'rgba(248, 222, 184, 0.07)',
        'rgba(248, 222, 184, 0)',
      ],
      vignetteRgba: [
        'rgba(40, 28, 24, 0)',
        'rgba(38, 26, 22, 0.11)',
        'rgba(28, 18, 16, 0.38)',
      ],
    },
    rug: {
      name: 'Quilted Rose & Cream Throw',
      baseStops: ['#E7D2CD', '#DEC5BF', '#D4B6AF'],
      borderHex: '#9A6F69',
      accentHex: '#FAF3EC',
      trimHex: '#EEDAD2',
      shadowRgb: { r: 38, g: 24, b: 22 },
    },
    mat: {
      centerRgb: { r: 236, g: 222, b: 212 },
      edgeRgb: { r: 222, g: 206, b: 196 },
      borderRgb: { r: 158, g: 126, b: 118 },
      accentRgb: { r: 250, g: 242, b: 236 },
      shadowRgb: { r: 36, g: 24, b: 20 },
      nightTint: 0xcbd0e4,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 246, 236, 0.09)',
      dayGradeMid: 'rgba(255, 240, 228, 0.03)',
      dayGradeBot: 'rgba(42, 30, 28, 0.05)',
      dayBeamStart: 'rgba(255, 245, 226, 0.12)',
      dayBeamMid: 'rgba(255, 238, 214, 0.04)',
      dayBeamEnd: 'rgba(255, 238, 214, 0)',
      goldenStart: 'rgba(255, 206, 152, 0.14)',
      goldenMid: 'rgba(232, 164, 118, 0.06)',
      goldenEdge: 'rgba(42, 24, 22, 0.15)',
      goldenBeamStart: 'rgba(255, 210, 156, 0.2)',
      goldenBeamMid: 'rgba(246, 184, 134, 0.05)',
      goldenBeamEnd: 'rgba(246, 184, 134, 0)',
      nightInner: 'rgba(26, 24, 46, 0.1)',
      nightMid: 'rgba(22, 22, 42, 0.27)',
      nightEdge: 'rgba(14, 14, 30, 0.5)',
      nightCoolShaft: 'rgba(148, 166, 224, 0.08)',
      nightPoolInner: 'rgba(255, 204, 138, 0.23)',
      nightPoolMid: 'rgba(240, 166, 98, 0.11)',
      nightPoolEdge: 'rgba(240, 166, 98, 0)',
      moteTints: { day: 0xfff5ec, golden: 0xffd5b0, night: 0xffc68c },
      moteAlphaMult: { day: 0.72, golden: 0.95, night: 0.88 },
    },
    props: {
      hoverRingColor: 0xffe8da,
      activeRingColor: 0xe69c92,
      warmGlowColor: 0xffba74,
      warmCoreColor: 0xffebd0,
      shadowColor: 0x261a16,
      accentColor: 0xc9837a,
    },
  },
  snowy_window: {
    id: 'snowy_window',
    label: 'Snowy Window',
    shortLabel: 'Snowy',
    description: 'Frosted Nordic pine planks, cable-knit winter rug, drifting snowflakes, and warm radiator.',
    swatchColors: ['#B8C3CC', '#F3F0EA', '#E09A64'],
    floor: {
      baseHex: '#A2B0BB',
      palette: ['#B8C3CC', '#AEBAC4', '#C3CDD5', '#A5B2BC', '#B4C0C9'],
      grooveHex: '#667480',
      accentHex: '#EBF3FA',
      secondaryHex: '#7E8D99',
      sunTintRgba: [
        'rgba(226, 242, 255, 0.26)',
        'rgba(198, 224, 246, 0.1)',
        'rgba(198, 224, 246, 0)',
      ],
      vignetteRgba: [
        'rgba(26, 36, 48, 0)',
        'rgba(24, 34, 46, 0.12)',
        'rgba(16, 24, 36, 0.42)',
      ],
    },
    rug: {
      name: 'Cable-Knit Winter Rug',
      baseStops: ['#F6F3ED', '#EDEAE2', '#E2DED5'],
      borderHex: '#7D96AC',
      accentHex: '#C96E5A',
      trimHex: '#FAF8F4',
      shadowRgb: { r: 24, g: 34, b: 46 },
    },
    mat: {
      centerRgb: { r: 224, g: 232, b: 240 },
      edgeRgb: { r: 202, g: 214, b: 226 },
      borderRgb: { r: 118, g: 138, b: 158 },
      accentRgb: { r: 246, g: 250, b: 255 },
      shadowRgb: { r: 22, g: 32, b: 44 },
      nightTint: 0xbfd0e8,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(226, 242, 255, 0.15)',
      dayGradeMid: 'rgba(212, 232, 250, 0.06)',
      dayGradeBot: 'rgba(32, 46, 66, 0.08)',
      dayBeamStart: 'rgba(232, 246, 255, 0.18)',
      dayBeamMid: 'rgba(210, 232, 250, 0.06)',
      dayBeamEnd: 'rgba(210, 232, 250, 0)',
      goldenStart: 'rgba(216, 224, 246, 0.14)',
      goldenMid: 'rgba(176, 192, 224, 0.06)',
      goldenEdge: 'rgba(28, 36, 56, 0.18)',
      goldenBeamStart: 'rgba(226, 234, 252, 0.18)',
      goldenBeamMid: 'rgba(186, 204, 236, 0.06)',
      goldenBeamEnd: 'rgba(186, 204, 236, 0)',
      nightInner: 'rgba(20, 30, 52, 0.12)',
      nightMid: 'rgba(16, 24, 46, 0.28)',
      nightEdge: 'rgba(10, 16, 34, 0.52)',
      nightCoolShaft: 'rgba(166, 204, 248, 0.14)',
      nightPoolInner: 'rgba(255, 198, 126, 0.25)',
      nightPoolMid: 'rgba(242, 160, 82, 0.12)',
      nightPoolEdge: 'rgba(242, 160, 82, 0)',
      moteTints: { day: 0xffffff, golden: 0xf4f8ff, night: 0xdcecff },
      moteAlphaMult: { day: 1.05, golden: 1.0, night: 0.98 },
    },
    props: {
      hoverRingColor: 0xe2f2ff,
      activeRingColor: 0x9ac6eb,
      warmGlowColor: 0xffb264,
      warmCoreColor: 0xffe8c2,
      shadowColor: 0x1b2634,
      accentColor: 0x89aac6,
    },
  },
  sunbeam: {
    id: 'sunbeam',
    label: 'Sunbeam Studio',
    shortLabel: 'Sunbeam',
    description: 'Golden honey-maple studio boards, oat linen mat, taped square, and a drifting sunbeam patch.',
    swatchColors: ['#D6A672', '#EDE3D2', '#FFD978'],
    floor: {
      baseHex: '#C2905E',
      palette: ['#D6A672', '#CC9B68', '#DFB07D', '#C18F5D', '#CFA06C'],
      grooveHex: '#7A5430',
      accentHex: '#FAE5BE',
      secondaryHex: '#94683E',
      sunTintRgba: [
        'rgba(255, 242, 186, 0.28)',
        'rgba(255, 224, 146, 0.1)',
        'rgba(255, 224, 146, 0)',
      ],
      vignetteRgba: [
        'rgba(44, 28, 14, 0)',
        'rgba(40, 26, 14, 0.1)',
        'rgba(28, 18, 10, 0.36)',
      ],
    },
    rug: {
      name: 'Oat Linen Studio Mat',
      baseStops: ['#F2EAD9', '#EAE0CB', '#E0D4BC'],
      borderHex: '#8C7458',
      accentHex: '#E09A4E',
      trimHex: '#F7F1E4',
      shadowRgb: { r: 40, g: 26, b: 14 },
    },
    mat: {
      centerRgb: { r: 234, g: 218, b: 194 },
      edgeRgb: { r: 220, g: 202, b: 176 },
      borderRgb: { r: 152, g: 126, b: 94 },
      accentRgb: { r: 248, g: 236, b: 216 },
      shadowRgb: { r: 38, g: 24, b: 14 },
      nightTint: 0xc9d0e0,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 248, 214, 0.12)',
      dayGradeMid: 'rgba(255, 244, 200, 0.04)',
      dayGradeBot: 'rgba(42, 32, 20, 0.05)',
      dayBeamStart: 'rgba(255, 246, 192, 0.18)',
      dayBeamMid: 'rgba(255, 236, 166, 0.07)',
      dayBeamEnd: 'rgba(255, 236, 166, 0)',
      goldenStart: 'rgba(255, 218, 128, 0.18)',
      goldenMid: 'rgba(242, 184, 92, 0.08)',
      goldenEdge: 'rgba(44, 24, 12, 0.15)',
      goldenBeamStart: 'rgba(255, 222, 134, 0.28)',
      goldenBeamMid: 'rgba(255, 198, 102, 0.09)',
      goldenBeamEnd: 'rgba(255, 198, 102, 0)',
      nightInner: 'rgba(24, 28, 48, 0.09)',
      nightMid: 'rgba(18, 24, 44, 0.24)',
      nightEdge: 'rgba(11, 16, 32, 0.46)',
      nightCoolShaft: 'rgba(146, 178, 226, 0.1)',
      nightPoolInner: 'rgba(255, 218, 138, 0.2)',
      nightPoolMid: 'rgba(242, 176, 88, 0.09)',
      nightPoolEdge: 'rgba(242, 176, 88, 0)',
      moteTints: { day: 0xfff5c6, golden: 0xffd77c, night: 0xffc66e },
      moteAlphaMult: { day: 0.95, golden: 1.15, night: 0.85 },
    },
    props: {
      hoverRingColor: 0xfff0be,
      activeRingColor: 0xf4c45c,
      warmGlowColor: 0xffd268,
      warmCoreColor: 0xfff6cf,
      shadowColor: 0x26170b,
      accentColor: 0xe2a24a,
    },
  },
  aquarium: {
    id: 'aquarium',
    label: 'Aquarium Fort',
    shortLabel: 'Aquarium',
    description: 'Deep slate-walnut den, blanket-fort patchwork rug, glowing fish tank, and cat tunnel.',
    swatchColors: ['#3E4752', '#3F657A', '#6BE0EC'],
    floor: {
      baseHex: '#343B44',
      palette: ['#434B56', '#3B424C', '#4B5460', '#363D47', '#404852'],
      grooveHex: '#20252C',
      accentHex: '#6EC8D4',
      secondaryHex: '#2B313A',
      sunTintRgba: [
        'rgba(112, 216, 232, 0.18)',
        'rgba(82, 172, 196, 0.06)',
        'rgba(82, 172, 196, 0)',
      ],
      vignetteRgba: [
        'rgba(12, 18, 26, 0)',
        'rgba(10, 16, 24, 0.18)',
        'rgba(6, 10, 16, 0.5)',
      ],
    },
    rug: {
      name: 'Blanket Fort Patchwork',
      baseStops: ['#476B80', '#3B5C70', '#314D5E'],
      borderHex: '#6EC4D0',
      accentHex: '#F3DFB4',
      trimHex: '#8DD6DE',
      shadowRgb: { r: 10, g: 16, b: 22 },
    },
    mat: {
      centerRgb: { r: 158, g: 186, b: 198 },
      edgeRgb: { r: 128, g: 158, b: 174 },
      borderRgb: { r: 68, g: 112, b: 132 },
      accentRgb: { r: 198, g: 228, b: 238 },
      shadowRgb: { r: 10, g: 16, b: 24 },
      nightTint: 0xb6d8ea,
      nightAlpha: 0.95,
    },
    lighting: {
      dayGradeTop: 'rgba(136, 216, 234, 0.1)',
      dayGradeMid: 'rgba(98, 178, 206, 0.04)',
      dayGradeBot: 'rgba(16, 24, 38, 0.14)',
      dayBeamStart: 'rgba(148, 232, 246, 0.14)',
      dayBeamMid: 'rgba(104, 198, 224, 0.05)',
      dayBeamEnd: 'rgba(104, 198, 224, 0)',
      goldenStart: 'rgba(156, 216, 232, 0.12)',
      goldenMid: 'rgba(104, 162, 196, 0.06)',
      goldenEdge: 'rgba(14, 20, 34, 0.22)',
      goldenBeamStart: 'rgba(152, 226, 242, 0.16)',
      goldenBeamMid: 'rgba(106, 184, 214, 0.05)',
      goldenBeamEnd: 'rgba(106, 184, 214, 0)',
      nightInner: 'rgba(14, 24, 42, 0.12)',
      nightMid: 'rgba(10, 18, 36, 0.28)',
      nightEdge: 'rgba(6, 12, 24, 0.52)',
      nightCoolShaft: 'rgba(106, 216, 238, 0.15)',
      nightPoolInner: 'rgba(116, 232, 246, 0.24)',
      nightPoolMid: 'rgba(72, 188, 212, 0.1)',
      nightPoolEdge: 'rgba(72, 188, 212, 0)',
      moteTints: { day: 0xc2f6ff, golden: 0xb0eefc, night: 0x8ae8fc },
      moteAlphaMult: { day: 0.85, golden: 0.95, night: 1.15 },
    },
    props: {
      hoverRingColor: 0xbaf6ff,
      activeRingColor: 0x62dae8,
      warmGlowColor: 0x6cd8e8,
      warmCoreColor: 0xdcfbff,
      shadowColor: 0x0c131c,
      accentColor: 0x5cc7d8,
    },
  },
  rooftop: {
    id: 'rooftop',
    label: 'Sunset Rooftop',
    shortLabel: 'Rooftop',
    description: 'Warm dusk terrace pavers, geometric kilim rug, brick parapet, and glowing string lights.',
    swatchColors: ['#8B7677', '#BA625B', '#F4B864'],
    floor: {
      baseHex: '#5E4E52',
      palette: ['#8B7778', '#806C6E', '#968282', '#756265', '#887476'],
      grooveHex: '#46383B',
      accentHex: '#D89B82',
      secondaryHex: '#6A585B',
      sunTintRgba: [
        'rgba(255, 196, 146, 0.22)',
        'rgba(218, 134, 148, 0.08)',
        'rgba(218, 134, 148, 0)',
      ],
      vignetteRgba: [
        'rgba(28, 16, 26, 0)',
        'rgba(26, 15, 24, 0.14)',
        'rgba(16, 10, 18, 0.46)',
      ],
    },
    rug: {
      name: 'Dusk Kilim Outdoor Rug',
      baseStops: ['#BF655D', '#AE5850', '#9B4C45'],
      borderHex: '#484468',
      accentHex: '#F2C97D',
      trimHex: '#F3E3D2',
      shadowRgb: { r: 28, g: 16, b: 22 },
    },
    mat: {
      centerRgb: { r: 198, g: 174, b: 170 },
      edgeRgb: { r: 172, g: 146, b: 144 },
      borderRgb: { r: 108, g: 82, b: 90 },
      accentRgb: { r: 228, g: 204, b: 198 },
      shadowRgb: { r: 24, g: 14, b: 18 },
      nightTint: 0xcabed8,
      nightAlpha: 0.94,
    },
    lighting: {
      dayGradeTop: 'rgba(255, 224, 196, 0.1)',
      dayGradeMid: 'rgba(244, 192, 168, 0.04)',
      dayGradeBot: 'rgba(46, 30, 42, 0.08)',
      dayBeamStart: 'rgba(255, 224, 182, 0.14)',
      dayBeamMid: 'rgba(246, 188, 154, 0.05)',
      dayBeamEnd: 'rgba(246, 188, 154, 0)',
      goldenStart: 'rgba(255, 184, 118, 0.2)',
      goldenMid: 'rgba(218, 122, 138, 0.1)',
      goldenEdge: 'rgba(34, 18, 34, 0.22)',
      goldenBeamStart: 'rgba(255, 194, 124, 0.24)',
      goldenBeamMid: 'rgba(232, 142, 146, 0.08)',
      goldenBeamEnd: 'rgba(232, 142, 146, 0)',
      nightInner: 'rgba(24, 20, 44, 0.12)',
      nightMid: 'rgba(18, 16, 38, 0.28)',
      nightEdge: 'rgba(10, 10, 26, 0.52)',
      nightCoolShaft: 'rgba(164, 166, 224, 0.1)',
      nightPoolInner: 'rgba(255, 206, 118, 0.25)',
      nightPoolMid: 'rgba(240, 156, 74, 0.12)',
      nightPoolEdge: 'rgba(240, 156, 74, 0)',
      moteTints: { day: 0xffeacc, golden: 0xffcb88, night: 0xffe27a },
      moteAlphaMult: { day: 0.82, golden: 1.08, night: 1.24 },
    },
    props: {
      hoverRingColor: 0xffdeb8,
      activeRingColor: 0xf2a266,
      warmGlowColor: 0xffb862,
      warmCoreColor: 0xffe9bc,
      shadowColor: 0x1c1218,
      accentColor: 0xd47462,
    },
  },
};

export function getSceneThemeDef(theme: SceneTheme): SceneThemeDefinition {
  return SCENE_THEME_DEFS[theme] ?? SCENE_THEME_DEFS.study;
}

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
