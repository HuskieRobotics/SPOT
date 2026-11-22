/**
 * Where on the field map a tap landed (docs/spec/05 SC-32). The map is drawn whole inside its box
 * (`object-fit: contain`), so the image may not fill the box; the tap is measured against the
 * drawn image, as a percentage of its width and height. A tap in the empty band beside the image
 * is clamped onto its edge by the session (`placePosition`).
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The tap at (`clientX`, `clientY`) in percent of the image drawn in `box`. `ratio` is the
 * image's width over its height; when unknown (0 or not finite), the image fills the box.
 */
export function tapOnMap(
  box: Box,
  ratio: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  let width = box.width;
  let height = box.height;
  if (Number.isFinite(ratio) && ratio > 0 && width > 0 && height > 0) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  const left = box.left + (box.width - width) / 2;
  const top = box.top + (box.height - height) / 2;
  return {
    x: width > 0 ? ((clientX - left) / width) * 100 : 0,
    y: height > 0 ? ((clientY - top) / height) * 100 : 0,
  };
}
