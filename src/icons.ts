/**
 * Inline SVG icons for the panel, drawn on a 16×16 grid with a 1.5px stroke.
 *
 * Built with createElementNS rather than innerHTML, so they work under a strict
 * CSP and never pass through an HTML parser.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape =
  | ['path', string]
  | ['circle', number, number, number]
  | ['rect', number, number, number, number, number];

const ICONS = {
  copy: [
    ['rect', 5.5, 5.5, 8, 8, 1.5],
    ['path', 'M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5'],
  ],
  pin: [['path', 'M5.5 2.5h5M6.5 2.5v4l-2 2.5h7l-2-2.5v-4M8 9v4.5']],
  tag: [
    ['path', 'M2.5 3.5v3.6a1 1 0 0 0 .3.7l5.4 5.4a1 1 0 0 0 1.4 0l3.6-3.6a1 1 0 0 0 0-1.4L7.8 2.8a1 1 0 0 0-.7-.3H3.5a1 1 0 0 0-1 1z'],
    ['circle', 5.5, 5.5, 0.6],
  ],
  trash: [['path', 'M2.5 4.5h11M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1']],
  download: [['path', 'M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13.5h10']],
  clear: [
    ['circle', 8, 8, 5.5],
    ['path', 'M4.1 4.1l7.8 7.8'],
  ],
  sun: [
    ['circle', 8, 8, 2.5],
    ['path', 'M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06'],
  ],
  moon: [['path', 'M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z']],
  minus: [['path', 'M3.5 8h9']],
  restore: [['rect', 3, 3, 10, 10, 2]],
  chevron: [['path', 'M6 4l4 4-4 4']],
  check: [['path', 'M3.5 8.5l3 3 6-7']],
  x: [['path', 'M4.5 4.5l7 7M11.5 4.5l-7 7']],
  search: [
    ['circle', 7, 7, 4.5],
    ['path', 'M10.5 10.5 13.5 13.5'],
  ],
  bolt: [['path', 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z']],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'candy-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls);
  for (const shape of ICONS[name] as Shape[]) {
    const el = document.createElementNS(SVG_NS, shape[0]);
    if (shape[0] === 'path') {
      el.setAttribute('d', shape[1]);
    } else if (shape[0] === 'circle') {
      el.setAttribute('cx', String(shape[1]));
      el.setAttribute('cy', String(shape[2]));
      el.setAttribute('r', String(shape[3]));
    } else {
      el.setAttribute('x', String(shape[1]));
      el.setAttribute('y', String(shape[2]));
      el.setAttribute('width', String(shape[3]));
      el.setAttribute('height', String(shape[4]));
      el.setAttribute('rx', String(shape[5]));
    }
    svg.appendChild(el);
  }
  return svg;
}

/** The Candy Logger mark: a filled tile with three log lines. */
export function mark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'candy-mark');
  const tile = document.createElementNS(SVG_NS, 'rect');
  tile.setAttribute('width', '16');
  tile.setAttribute('height', '16');
  tile.setAttribute('rx', '4');
  tile.setAttribute('fill', 'currentColor');
  svg.appendChild(tile);
  for (const [y, w] of [
    [4.5, 9],
    [7.25, 6],
    [10, 7.5],
  ]) {
    const line = document.createElementNS(SVG_NS, 'rect');
    line.setAttribute('x', '3.5');
    line.setAttribute('y', String(y));
    line.setAttribute('width', String(w));
    line.setAttribute('height', '1.5');
    line.setAttribute('rx', '0.75');
    line.setAttribute('fill', '#fff');
    svg.appendChild(line);
  }
  return svg;
}
