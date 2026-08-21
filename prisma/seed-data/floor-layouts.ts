/**
 * Desk/room/utility placement for the three real customer-zero floor plans
 * (docs/floorplans/Floor-{2,4,5}.pdf, rendered at 2x scale to a 1584x1224 PNG).
 *
 * Floor 2's plan prints real desk numbers ("BD: 2.01" etc.) in clean grid
 * clusters, so its coordinates below are read directly off the rendered
 * image. Floors 4 and 5 are dense architectural drawings (desk pods, meeting
 * rooms, stairs/lifts/bathrooms) with no per-desk numbering — their desk grids
 * are placed within the real desk-pod regions visible in the drawing, but are
 * a reasonable approximation rather than a pixel-perfect trace. All of this is
 * easy to correct later in the Phase 4 floor-plan editor.
 */

export interface DeskSeed {
  number: string;
  x: number;
  y: number;
  requiresCheckIn?: boolean;
}

export interface RoomSeed {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UtilitySeed {
  type: string;
  label?: string;
  x: number;
  y: number;
}

export interface FloorLayout {
  pdfBaseName: string;
  floorName: string;
  sortOrder: number;
  desks: DeskSeed[];
  rooms: RoomSeed[];
  utilities: UtilitySeed[];
}

/** A row-major (serpentine-numbered where `serpentine` is set) desk grid. */
function grid(opts: {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  numbers: string[];
}): DeskSeed[] {
  const desks: DeskSeed[] = [];
  for (let row = 0; row < opts.rows; row++) {
    for (let col = 0; col < opts.cols; col++) {
      const index = row * opts.cols + col;
      const number = opts.numbers[index];
      if (!number) continue;
      desks.push({
        number,
        x: opts.originX + col * opts.cellWidth,
        y: opts.originY + row * opts.cellHeight,
      });
    }
  }
  return desks;
}

/** "2.01".."2.32", boustrophedon-numbered exactly as printed on the plan. */
function floor2Numbers(prefix: string, start: number, count: number, cols: number): string[] {
  const numbers: string[] = [];
  for (let row = 0; row < Math.ceil(count / cols); row++) {
    const rowNumbers: number[] = [];
    for (let col = 0; col < cols; col++) {
      const n = start + row * cols + col;
      if (n < start + count) rowNumbers.push(n);
    }
    if (row % 2 === 1) rowNumbers.reverse();
    for (const n of rowNumbers) numbers.push(`${prefix}${String(n).padStart(2, "0")}`);
  }
  return numbers;
}

export const FLOOR_LAYOUTS: FloorLayout[] = [
  {
    pdfBaseName: "Floor-2",
    floorName: "Level 2",
    sortOrder: 2,
    desks: [
      ...grid({
        originX: 1188,
        originY: 372,
        cols: 5,
        rows: 2,
        cellWidth: 75,
        cellHeight: 52,
        numbers: floor2Numbers("2.", 1, 10, 5),
      }),
      ...grid({
        originX: 1293,
        originY: 560,
        cols: 3,
        rows: 2,
        cellWidth: 75,
        cellHeight: 50,
        numbers: floor2Numbers("2.", 11, 6, 3),
      }),
      ...grid({
        originX: 1188,
        originY: 725,
        cols: 5,
        rows: 2,
        cellWidth: 75,
        cellHeight: 50,
        numbers: floor2Numbers("2.", 17, 10, 5),
      }),
      ...grid({
        originX: 1050,
        originY: 888,
        cols: 3,
        rows: 2,
        cellWidth: 75,
        cellHeight: 50,
        numbers: floor2Numbers("2.", 27, 6, 3),
      }),
    ].map((desk, i) => (i % 16 === 0 ? { ...desk, requiresCheckIn: true } : desk)),
    rooms: [
      { name: "Meeting Room 2A", x: 1065, y: 100, width: 150, height: 200 },
      { name: "Meeting Room 2B", x: 1220, y: 100, width: 300, height: 200 },
      { name: "Meeting Room 2C", x: 125, y: 865, width: 565, height: 275 },
      { name: "Meeting Room 2D", x: 700, y: 865, width: 290, height: 275 },
    ],
    utilities: [],
  },
  {
    pdfBaseName: "Floor-4",
    floorName: "Level 4",
    sortOrder: 4,
    desks: [
      ...grid({
        originX: 1095,
        originY: 265,
        cols: 3,
        rows: 6,
        cellWidth: 55,
        cellHeight: 95,
        numbers: Array.from({ length: 18 }, (_, i) => `4.${String(i + 1).padStart(2, "0")}`),
      }),
      ...grid({
        originX: 520,
        originY: 305,
        cols: 4,
        rows: 3,
        cellWidth: 45,
        cellHeight: 85,
        numbers: Array.from({ length: 12 }, (_, i) => `4.${String(i + 19).padStart(2, "0")}`),
      }),
      ...grid({
        originX: 750,
        originY: 400,
        cols: 4,
        rows: 1,
        cellWidth: 60,
        cellHeight: 40,
        numbers: Array.from({ length: 4 }, (_, i) => `4.${String(i + 31).padStart(2, "0")}`),
      }),
    ].map((desk, i) => (i % 17 === 0 ? { ...desk, requiresCheckIn: true } : desk)),
    rooms: [
      { name: "Meeting Room 4A", x: 895, y: 585, width: 110, height: 100 },
      { name: "Meeting Room 4B", x: 895, y: 785, width: 110, height: 100 },
      { name: "Meeting Room 4C", x: 1150, y: 945, width: 110, height: 80 },
    ],
    utilities: [
      { type: "kitchen", label: "Kitchen", x: 790, y: 985 },
      { type: "printer", label: "Print/Copy", x: 985, y: 295 },
    ],
  },
  {
    pdfBaseName: "Floor-5",
    floorName: "Level 5",
    sortOrder: 5,
    desks: [
      ...grid({
        originX: 960,
        originY: 225,
        cols: 3,
        rows: 3,
        cellWidth: 50,
        cellHeight: 85,
        numbers: Array.from({ length: 9 }, (_, i) => `5.${String(i + 1).padStart(2, "0")}`),
      }),
      ...grid({
        originX: 960,
        originY: 590,
        cols: 3,
        rows: 3,
        cellWidth: 50,
        cellHeight: 80,
        numbers: Array.from({ length: 9 }, (_, i) => `5.${String(i + 10).padStart(2, "0")}`),
      }),
      ...grid({
        originX: 520,
        originY: 455,
        cols: 4,
        rows: 2,
        cellWidth: 45,
        cellHeight: 80,
        numbers: Array.from({ length: 8 }, (_, i) => `5.${String(i + 19).padStart(2, "0")}`),
      }),
    ].map((desk, i) => (i % 13 === 0 ? { ...desk, requiresCheckIn: true } : desk)),
    rooms: [
      { name: "Meeting Room 5A", x: 520, y: 195, width: 165, height: 110 },
      { name: "Meeting Room 5B", x: 700, y: 190, width: 125, height: 115 },
      { name: "Meeting Room 5C", x: 825, y: 190, width: 90, height: 115 },
      { name: "Meeting Room 5D", x: 735, y: 335, width: 205, height: 95 },
      { name: "Meeting Room 5E", x: 800, y: 785, width: 110, height: 105 },
    ],
    utilities: [
      { type: "kitchen", label: "Coffee point", x: 600, y: 955 },
      { type: "printer", label: "Print/Copy", x: 975, y: 825 },
    ],
  },
];
