/**
 * Legacy (v1) scouting button CSS class names → background colors, extracted from
 * src/scouting/public/css/match-scouting.css of SPOT v5 (docs/spec/02). Used by the v1→v2
 * converter so configs carry explicit colors (docs/spec/14 answer 51).
 */
export const LEGACY_CLASS_COLORS: Record<string, string> = {
  gray: "#707070",
  silver: "#919191",
  green: "#4caf50",
  orange: "#ef6c00",
  sherbert: "#ffa347",
  red: "#ff4436",
  navy: "#3f51b5",
  pink: "#f06292",
  yellow: "#d8c24f",
  bluegreen: "#0babab",
  lightbluegreen: "#56b8b8",
  darkbluegreen: "#077777",
  lightCoral: "#ff69b4",
  coral: "#ff1493",
  darkCoral: "#c71585",
  deepBlue: "#001f3f",
  shallowBlue: "#2063b1",
  highlight: "#2f5f77",
  fuel2026: "#e6bd39",
  blue2026: "#5a929e",
  lightblue2026: "#66be8c",
  orange2026: "#e65217",
  "rating-lowest": "#ff4545",
  "rating-second-lowest": "#ffa941",
  "rating-second-highest": "#a1c326",
  "rating-highest": "#00b844",
};

/** Non-color helper classes that appeared in v1 configs. */
export const LEGACY_HELPER_CLASSES = new Set(["timer", "border", "button-padding", "largeAction"]);
