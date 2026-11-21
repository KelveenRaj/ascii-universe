import * as THREE from 'three';
import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';

/** A name tag for something in the scene, framed by target brackets when it has a radius. */
export interface SceneLabel {
  /** World position of the thing being labelled. */
  position: THREE.Vector3;
  text: string;
  /**
   * Apparent radius in world units (e.g. a black hole's shadow); the brackets frame it. Omit for a
   * plain centred tag.
   */
  radius?: number;
  style?: TextStyle;
  /** Body id to warp to when the label is clicked. */
  target?: string;
}

/** Cells a drawn label covers (inclusive, row 0 at the top), for click hit-testing. */
export interface LabelRect {
  col0: number;
  row0: number;
  col1: number;
  row1: number;
}

export interface GridPoint {
  /** Cell under the point, row 0 at the top. May be outside the grid. */
  col: number;
  row: number;
  /** Cells per world unit at the point's depth (for sizing brackets). */
  cellsPerUnit: number;
}

const local = new THREE.Vector3();

/**
 * Projects a world point onto the character grid with the same pinhole model scenes use to build
 * view rays (vertical FOV from tanHalfFov, square cells). Null if the point is behind the camera.
 * Lensing is ignored, which is exact for anything on the line of sight through the hole's centre.
 */
/** The camera the text layer is drawn through this frame. */
export interface DrawView {
  camera: THREE.PerspectiveCamera;
  tanHalfFov: number;
  /** Width / height of the view. */
  aspect: number;
}

export function projectToGrid(
  position: THREE.Vector3,
  camera: THREE.Camera,
  tanHalfFov: number,
  cols: number,
  rows: number,
): GridPoint | null {
  local.copy(position).applyMatrix4(camera.matrixWorldInverse);
  const depth = -local.z;
  if (depth <= 1e-6) return null;
  const aspect = cols / rows;
  const ndcX = local.x / depth / (aspect * tanHalfFov);
  const ndcY = local.y / depth / tanHalfFov;
  return {
    col: Math.floor(((ndcX + 1) / 2) * cols),
    row: rows - 1 - Math.floor(((ndcY + 1) / 2) * rows),
    cellsPerUnit: rows / (2 * tanHalfFov) / depth,
  };
}

/**
 * Draws one label into the text layer: ┌ ┐ └ ┘ around the object and its name top-right. Returns
 * the cells it covers (brackets and name), or null if nothing was drawn.
 */
export function drawLabel(
  text: TextLayer,
  label: SceneLabel,
  camera: THREE.Camera,
  tanHalfFov: number,
): LabelRect | null {
  const p = projectToGrid(label.position, camera, tanHalfFov, text.cols, text.rows);
  if (!p) return null;
  const style = label.style ?? 'bright';
  if (label.radius === undefined) {
    const col0 = p.col - Math.floor(label.text.length / 2);
    text.put(col0, p.row, label.text, style);
    return { col0, row0: p.row, col1: col0 + label.text.length - 1, row1: p.row };
  }
  // one cell of margin, and never so small that the corners touch
  const r = Math.max(2, Math.ceil(label.radius * p.cellsPerUnit) + 1);
  // when the object fills the view the brackets would sit off-screen; skip them
  if (r > Math.max(text.cols, text.rows)) return null;
  text.put(p.col - r, p.row - r, '┌', 'normal');
  text.put(p.col + r, p.row - r, '┐', 'normal');
  text.put(p.col - r, p.row + r, '└', 'normal');
  text.put(p.col + r, p.row + r, '┘', 'normal');
  text.put(p.col + r + 2, p.row - r, label.text, style);
  return {
    col0: p.col - r,
    row0: p.row - r,
    col1: p.col + r + 2 + label.text.length - 1,
    row1: p.row + r,
  };
}
