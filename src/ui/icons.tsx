// Icone dell'interfaccia, disegnate tutte nello stesso stile (griglia 24×24, tratto 1,75 con estremi
// arrotondati, colore del testo): comandi generali e simboli elettrici IEC semplificati (bobina,
// contatto, morsetto, rimando). Prendono il posto dei caratteri Unicode e delle emoji, che cambiano
// aspetto tra Windows e macOS.
import type { ReactNode } from 'react';

/** Dentata di un ingranaggio a 8 denti (raggio esterno 9,5, interno 7) */
function gear(): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const [r, d] of [[7, -0.3], [9.5, -0.17], [9.5, 0.17], [7, 0.3]] as const) {
      const t = a + d;
      pts.push(`${(12 + Math.cos(t) * r).toFixed(2)} ${(12 + Math.sin(t) * r).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}

const dot = (x: number, y: number, r = 1.4) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const P = (d: string) => <path d={d} />;
const DOC = 'M14 3H6.5a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z M14 3v5h5';

const ICONS: Record<string, ReactNode> = {
  // File
  new: <>{P(DOC)}{P('M12 11v6 M9 14h6')}</>,
  folder: P('M4 18.5V5.5A1.5 1.5 0 0 1 5.5 4H9l2 2h7.5A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z'),
  open: P('M4 19.5V5.5A1.5 1.5 0 0 1 5.5 4H9l2 2h6.5A1.5 1.5 0 0 1 19 7.5V10 M4 19.5h14l3-8.5H7.2z'),
  save: P('M5.5 3.5h10l4 4v11a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V5a1.5 1.5 0 0 1 1.5-1.5z M8 3.5V8h7V3.5 M8 20v-6h8v6'),
  saveAs: <>{P('M5.5 3.5h10l4 4v4 M12 20H5.5A1.5 1.5 0 0 1 4 18.5V5a1.5 1.5 0 0 1 1.5-1.5 M8 3.5V8h7V3.5 M8 20v-6h4')}{P('M14.5 21l.7-2.8 4.8-4.8a1.5 1.5 0 0 1 2.1 2.1l-4.8 4.8z')}</>,
  print: P('M7 9V3.5h10V9 M7 17.5H5.5A1.5 1.5 0 0 1 4 16v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1.5 1.5 0 0 1-1.5 1.5H17 M7 14h10v6.5H7z'),
  pdf: <>{P(DOC)}{P('M8.5 13h7 M8.5 16.5h4.5')}</>,
  import: P('M12 3.5v11 M7.5 10l4.5 4.5 4.5-4.5 M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2'),
  export: P('M12 14.5v-11 M7.5 8L12 3.5 16.5 8 M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2'),
  home: P('M3.5 11 12 3.5l8.5 7.5 M5.5 9.5v10h5v-6h3v6h5v-10'),
  recent: <><circle cx={12} cy={12} r={8.5} />{P('M12 7.5V12l3 2')}</>,
  // Modifica
  undo: P('M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
  redo: P('M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13'),
  cut: <><circle cx={6.5} cy={17.5} r={2.8} /><circle cx={17.5} cy={17.5} r={2.8} />{P('M8.5 15.5 18 4 M15.5 15.5 6 4')}</>,
  copy: <><rect x={8.5} y={8.5} width={12} height={12} rx={1.5} />{P('M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5')}</>,
  paste: <><rect x={5} y={4.5} width={14} height={16.5} rx={1.5} /><rect x={9} y={2.5} width={6} height={4} rx={1} />{P('M8.5 12h7 M8.5 15.5h5')}</>,
  duplicate: <><rect x={8.5} y={8.5} width={12} height={12} rx={1.5} />{P('M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5 M14.5 11.5v6 M11.5 14.5h6')}</>,
  delete: P('M4 7h16 M9.5 3.5h5 M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7 M10 11v6 M14 11v6'),
  selectAll: <><rect x={3.5} y={3.5} width={17} height={17} rx={1.5} strokeDasharray="3 2.5" />{P('M9 12.5l2.2 2.2L15.5 10')}</>,
  rotate: P('M20 12a8 8 0 1 1-2.3-5.6 M20 4v4.5h-4.5'),
  mirror: <>{P('M12 3v18')}{P('M9 7 4 17h5z M15 7l5 10h-5z')}</>,
  align: P('M4 4v16 M8 7h9 M8 12h12 M8 17h6'),
  search: <><circle cx={10.5} cy={10.5} r={6.5} />{P('M20 20l-4.8-4.8')}</>,
  replace: <><circle cx={10.5} cy={10.5} r={6.5} />{P('M20 20l-4.8-4.8 M8 9.5h5 M11 7.5l2 2-2 2')}</>,
  // Disegno
  select: P('M5 4l6.5 16 2.4-6.6L20.5 11z'),
  wire: <>{P('M5 6h7v12h7')}{dot(4.5, 6, 1.8)}{dot(19.5, 18, 1.8)}</>,
  quickV: <>{P('M7 4h10 M7 20h10 M12 4v16')}{dot(12, 4, 1.8)}{dot(12, 20, 1.8)}</>,
  quickH: <>{P('M4 7v10 M20 7v10 M4 12h16')}{dot(4, 12, 1.8)}{dot(20, 12, 1.8)}</>,
  wireNumbers: <>{P('M6 3.5v17 M12 3.5v17 M18 3.5v17')}<path d="M3 12h18" strokeDasharray="2 2" /></>,
  bundle: <><path d="M3 7.5h18" strokeWidth={3.6} />{P('M7 7.5V20 M12 7.5V20 M17 7.5V20')}</>,
  bus: <><rect x={3} y={3.5} width={7} height={5.5} rx={1} /><rect x={14} y={15} width={7} height={5.5} rx={1} />{P('M6.5 9v3.5h11V15')}{dot(6.5, 12.5)}{dot(17.5, 12.5)}</>,
  zone: <><rect x={3.5} y={3.5} width={17} height={17} rx={1.5} strokeDasharray="3 2.5" />{P('M12 8.5v7 M8.5 12h7')}</>,
  cable: <>{P('M3 7h18 M3 12h18 M3 17h18')}<ellipse cx={12} cy={12} rx={3.2} ry={8} /></>,
  wiredef: P('M7 3.5v17 M12 3.5v17 M17 3.5v17 M3.5 16l17-7'),
  text: P('M5 7V4.5h14V7 M12 4.5v15 M9 19.5h6'),
  image: <><rect x={3} y={4.5} width={18} height={15} rx={1.5} /><circle cx={9} cy={10} r={1.8} />{P('M21 16l-5-5-8.5 8.5')}</>,
  drawing: <><rect x={3.5} y={3.5} width={17} height={17} rx={1.5} /><circle cx={12} cy={12} r={5} />{P('M3.5 20.5 20.5 3.5')}</>,
  fit: <>{P('M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5')}<rect x={8.5} y={8.5} width={7} height={7} rx={1} /></>,
  railTop: P('M3 5h18 M3 9.5h18 M7 9.5V20 M17 9.5V20'),
  railBottom: P('M3 19h18 M3 14.5h18 M7 14.5V4 M17 14.5V4'),
  // Simboli elettrici (IEC, semplificati)
  coil: <><rect x={7} y={7} width={10} height={10} rx={0.5} />{P('M12 2.5V7 M12 17v4.5')}</>,
  contact: P('M12 2.5V8 M12 16v5.5 M12 16 7 8.5'),
  contactNC: P('M12 2.5V8 M12 16v5.5 M12 16l4.5-8.5 M12 8h5.5'),
  terminal: <><circle cx={12} cy={12} r={3.5} />{P('M12 2.5v6 M12 15.5v6')}</>,
  link: P('M3 12h8 M11 7h6.5l3.5 5-3.5 5H11z'),
  linkIn: P('M21 12h-8 M13 7H6.5L3 12l3.5 5H13z'),
  motor: <><circle cx={12} cy={12} r={8} />{P('M8.5 15V9l3.5 4.2L15.5 9v6')}</>,
  plc: <><rect x={6} y={6} width={12} height={12} rx={1.5} />{P('M9.5 3v3 M14.5 3v3 M9.5 18v3 M14.5 18v3 M3 9.5h3 M3 14.5h3 M18 9.5h3 M18 14.5h3')}</>,
  connector: P('M9 2.5v4.5 M15 2.5v4.5 M6 7h12v4a6 6 0 0 1-12 0z M12 17v4.5'),
  macro: P('M12 3 3 7.5l9 4.5 9-4.5z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5'),
  // Pagine
  page: <>{P(DOC)}{P('M8.5 12.5h7 M8.5 16h7')}</>,
  schema: <>{P(DOC)}{P('M8.5 11v3h3.5v3.5H16')}</>,
  singleline: <>{P(DOC)}{P('M12 10v9 M10 13l4-1.5 M10 16l4-1.5')}</>,
  network: <><circle cx={12} cy={5} r={2.2} /><circle cx={5} cy={18.5} r={2.2} /><circle cx={19} cy={18.5} r={2.2} />{P('M12 7.2v4.3 M5 16.3V13.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2.8')}</>,
  cabinet: <><rect x={4} y={3} width={16} height={18} rx={1.5} />{P('M4 8h16 M7.5 11.5h3.5v5H7.5z M13 11.5h3.5v5H13z')}</>,
  cover: <><rect x={5} y={3} width={14} height={18} rx={1.5} />{P('M8.5 7.5h7 M8.5 11h4.5')}</>,
  system: <><rect x={3} y={3.5} width={7.5} height={7} rx={1} /><rect x={13.5} y={13.5} width={7.5} height={7} rx={1} />{P('M10.5 7h3.5a3 3 0 0 1 3 3v3.5 M6.75 10.5V17H13.5')}</>,
  sort: P('M7 4v16 M3.5 16.5 7 20l3.5-3.5 M14 6h7 M14 12h5 M14 18h3'),
  titleBlock: <><rect x={3} y={4.5} width={18} height={15} rx={1.5} />{P('M12 14.5h9 M12 14.5v5 M16.5 14.5v5')}</>,
  // Progetto e liste
  settings: <><path d={gear()} /><circle cx={12} cy={12} r={3} /></>,
  props: <>{P('M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1')}<circle cx={15} cy={6} r={2} /><circle cx={9} cy={12} r={2} /><circle cx={17} cy={18} r={2} /></>,
  check: <><circle cx={12} cy={12} r={8.5} />{P('M8 12.5l2.8 2.8L16 9.8')}</>,
  number: P('M5 9h14 M5 15h14 M10 4 8 20 M16 4l-2 16'),
  list: <>{P('M9 6h11 M9 12h11 M9 18h11')}{dot(4.5, 6)}{dot(4.5, 12)}{dot(4.5, 18)}</>,
  table: <><rect x={3.5} y={4.5} width={17} height={15} rx={1.5} />{P('M3.5 9.5h17 M3.5 14.5h17 M9.5 9.5v10')}</>,
  part: P('M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12 4 7.5'),
  terminalStrip: <><rect x={3.5} y={7.5} width={17} height={9} rx={1} />{P('M7.75 7.5v9 M12 7.5v9 M16.25 7.5v9')}</>,
  distributor: P('M12 3.5v5 M12 8.5 5 15v5.5 M12 8.5v12 M12 8.5l7 6.5v5.5'),
  calc: <><rect x={5} y={3} width={14} height={18} rx={1.5} />{P('M8.5 7h7v3h-7z')}{dot(9, 14, 1.1)}{dot(12, 14, 1.1)}{dot(15, 14, 1.1)}{dot(9, 17.5, 1.1)}{dot(12, 17.5, 1.1)}{dot(15, 17.5, 1.1)}</>,
  place: <>{P('M12 21s-6.5-6-6.5-11.5a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z')}<circle cx={12} cy={9.5} r={2.3} /></>,
  label: <>{P('M3.5 12.5V4.5a1 1 0 0 1 1-1h8L21 12l-8.5 8.5z')}{dot(8, 8, 1.5)}</>,
  translate: P('M4 5.5h8.5 M8.25 3.5v2 M11 5.5c0 4-3 7-6.5 8.5 M6.5 9.5c1.2 2 3 3.5 5.5 4.3 M13 20.5l4-9 4 9 M14.4 17.5h5.2'),
  ai: P('M11 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'),
  revision: P('M3.5 12a8.5 8.5 0 1 0 2.5-6 M3.5 4v4.5H8 M12 7.5V12l3 2'),
  release: <>{P('M12 3l2.3 1.6 2.8-.1.9 2.7 2.2 1.7-.9 2.6.9 2.6-2.2 1.7-.9 2.7-2.8-.1L12 21l-2.3-1.6-2.8.1-.9-2.7-2.2-1.7.9-2.6-.9-2.6 2.2-1.7.9-2.7 2.8.1z')}{P('M9 12.2l2.2 2.2 4-4.2')}</>,
  compare: P('M7 3.5 3.5 7 7 10.5 M3.5 7H16 M17 13.5l3.5 3.5-3.5 3.5 M20.5 17H8'),
  template: <><rect x={3.5} y={3.5} width={17} height={17} rx={1.5} />{P('M3.5 9h17 M9.5 9v11.5')}</>,
  user: <><circle cx={12} cy={8} r={4} />{P('M4.5 20.5a7.5 7.5 0 0 1 15 0')}</>,
  // Visualizza e aiuto
  panels: <><rect x={3} y={4} width={18} height={16} rx={1.5} />{P('M9 4v16 M15 4v16')}</>,
  theme: P('M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),
  language: <><circle cx={12} cy={12} r={8.5} />{P('M3.5 12h17 M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z')}</>,
  prev: P('M15 5l-7 7 7 7'),
  next: P('M9 5l7 7-7 7'),
  help: <><circle cx={12} cy={12} r={8.5} />{P('M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5')}{dot(12, 17, 1.2)}</>,
  info: <><circle cx={12} cy={12} r={8.5} />{P('M12 11v6')}{dot(12, 7.8, 1.2)}</>,
  update: P('M20 11a8 8 0 0 0-14.6-4.5 M4.5 3v4h4 M4 13a8 8 0 0 0 14.6 4.5 M19.5 21v-4h-4'),
  keyboard: <><rect x={2.5} y={6} width={19} height={12} rx={1.5} />{P('M8 14.5h8')}{dot(6.5, 10, 1)}{dot(10, 10, 1)}{dot(14, 10, 1)}{dot(17.5, 10, 1)}</>,
  web: P('M14 4h6v6 M20 4l-9 9 M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'),
  back: P('M19 12H5 M11 6l-6 6 6 6'),
  star: P('M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z'),
  chevronDown: P('M6 9l6 6 6-6'),
  chevronUp: P('M6 15l6-6 6 6'),
  close: P('M6 6l12 12 M18 6 6 18'),
  more: <>{dot(6, 12, 1.5)}{dot(12, 12, 1.5)}{dot(18, 12, 1.5)}</>,
};

export type IconName = keyof typeof ICONS;

/** Le icone che esistono (per i test e per la galleria delle scorciatoie) */
export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 18, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  const body = ICONS[name] ?? ICONS.more;
  return (
    <svg className={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}
