// Immagini sullo schema: da file (Inserisci ▸ Immagine…) o dagli appunti (⌘/Ctrl+V). Le immagini
// troppo grandi si rimpiccioliscono, perché il progetto resti leggero.
import { useStore } from '../model/store';
import { FRAME, PAGE_W, PAGE_H, type ImageItem } from '../model/types';
import { openFiles } from '../io/fileio';
import { uid } from '../model/geometry';
import { tx } from '../i18n/ui';

/** Lato più lungo (pixel) oltre il quale l'immagine si rimpicciolisce */
const MAX_PX = 1600;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
export const IMAGE_EXT = Object.keys(MIME);

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('immagine non leggibile'));
  im.src = src;
});

/**
 * Immagine pronta per il progetto: data URL (in PNG o JPEG, rimpicciolita se serve; gli SVG restano
 * vettoriali) e misure in pixel
 */
export async function prepareImage(blob: Blob): Promise<{ src: string; wPx: number; hPx: number }> {
  let src = await toDataUrl(blob);
  const im = await load(src);
  let wPx = im.naturalWidth || 400, hPx = im.naturalHeight || 300;
  // Il PDF accetta solo PNG e JPEG: gli altri formati raster si convertono
  const raster = blob.type !== 'image/svg+xml';
  if (raster && (Math.max(wPx, hPx) > MAX_PX || !['image/png', 'image/jpeg'].includes(blob.type))) {
    const k = Math.min(1, MAX_PX / Math.max(wPx, hPx));
    const c = document.createElement('canvas');
    c.width = Math.round(wPx * k); c.height = Math.round(hPx * k);
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
    src = blob.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.88) : c.toDataURL('image/png');
    wPx = c.width; hPx = c.height;
  }
  return { src, wPx, hPx };
}

/** Misure iniziali sulla pagina: al massimo 120 × 100 mm, con le proporzioni dell'immagine */
export function initialSize(wPx: number, hPx: number): { w: number; h: number } {
  const k = Math.min(120 / wPx, 100 / hPx, 0.5);
  return { w: Math.round(wPx * k), h: Math.round(hPx * k) };
}

/** Aggiunge le immagini alla pagina corrente, al centro, e le seleziona */
export async function addImages(files: { name: string; blob: Blob }[]) {
  const st = useStore.getState;
  const els: ImageItem[] = [];
  for (const [i, f] of files.entries()) {
    try {
      const { src, wPx, hPx } = await prepareImage(f.blob);
      const { w, h } = initialSize(wPx, hPx);
      const x = Math.round((PAGE_W - w) / 2) + i * 10, y = Math.round((PAGE_H - h) / 2) - 10 + i * 10;
      els.push({ kind: 'image', id: uid('i'), x, y, w, h, src, name: f.name });
    } catch {
      st().logMsg(tx('Immagine non leggibile: {0}', f.name), 'warn');
    }
  }
  if (!els.length) return;
  st().setView('schema');
  st().addElements(els);
  st().setSelection(els.map(e => e.id));
}

/** Inserisci ▸ Immagine…: PNG, JPG, SVG, GIF, WebP o BMP */
export async function insertImageFromFile() {
  const files = await openFiles([{ name: tx('Immagine'), extensions: IMAGE_EXT }], true);
  await addImages(files.map(f => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return { name: f.name, blob: new Blob([f.data as BlobPart], { type: MIME[ext] ?? 'image/png' }) };
  }));
}

/** Immagini negli appunti (incolla): true se ce n'erano */
export async function pasteImages(data: DataTransfer | null): Promise<boolean> {
  const files = [...(data?.files ?? [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return false;
  await addImages(files.map(f => ({ name: f.name || tx('immagine incollata'), blob: f })));
  return true;
}

/** Sostituisce l'immagine mantenendo posizione e larghezza (l'altezza segue le proporzioni nuove) */
export async function replaceImage(img: ImageItem) {
  const [f] = await openFiles([{ name: tx('Immagine'), extensions: IMAGE_EXT }]);
  if (!f) return;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  const { src, wPx, hPx } = await prepareImage(new Blob([f.data as BlobPart], { type: MIME[ext] ?? 'image/png' }));
  useStore.getState().updateElement(img.id, { src, name: f.name, h: Math.round(img.w * hPx / wPx * 2) / 2 });
}

/** Proporzioni originali dell'immagine, tenendo la larghezza */
export async function naturalRatio(img: ImageItem) {
  const im = await load(img.src);
  if (im.naturalWidth) useStore.getState().updateElement(img.id, { h: Math.round(img.w * im.naturalHeight / im.naturalWidth * 2) / 2 });
}

/**
 * Inserisci ▸ Disegno DXF…: la grafica del DXF (linee, polilinee, cerchi, archi, testi) sulla pagina
 * come disegno vettoriale, 1:1 in millimetri se sta nell'area di disegno, altrimenti ridotto.
 * Si sposta, si ridimensiona e si elimina come un'immagine.
 */
export async function insertDxfDrawing() {
  const [f] = await openFiles([{ name: tx('Disegno DXF'), extensions: ['dxf'] }]);
  if (!f) return;
  const st = useStore.getState;
  const { dxfToPrims } = await import('../io/dxfImport');
  const g = dxfToPrims(new TextDecoder().decode(f.data), FRAME.right - FRAME.left - 20, FRAME.bottom - FRAME.top - 20);
  if (!g.prims.length) { st().logMsg(tx('Nel DXF {0} non c\'è grafica leggibile (linee, cerchi, testi)', f.name), 'warn'); return; }
  const w = Math.max(1, g.width), h = Math.max(1, g.height);
  const x = Math.round(FRAME.left + (FRAME.right - FRAME.left - w) / 2), y = Math.round(FRAME.top + (FRAME.bottom - FRAME.top - h) / 2);
  const el: ImageItem = { kind: 'image', id: uid('i'), x, y, w, h, src: '', name: f.name, vector: { prims: g.prims, w, h }, front: true };
  st().setView('schema');
  st().addElements([el]);
  st().setSelection([el.id]);
  st().logMsg(g.scale < 1 ? tx('Disegno {0} inserito ridotto al {1}% per stare nella pagina', f.name, Math.round(g.scale * 100)) : tx('Disegno {0} inserito in scala 1:1', f.name));
}
