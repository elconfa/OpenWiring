// Albero della libreria dei simboli (pannello Simboli): le categorie «A / B» vengono dalle cartelle
// e sottocartelle della cartella dei simboli, quindi si raggruppano spostando i file.
import type { SymbolDef } from './types';

/** Gruppo dell'albero dei simboli: una cartella (categoria «A / B» = cartella A, sottocartella B) */
export interface TreeNode { name: string; path: string; items: SymbolDef[]; children: TreeNode[] }

/** Albero delle cartelle dai nomi delle categorie, in ordine alfabetico */
export function symbolTree(symbols: SymbolDef[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', items: [], children: [] };
  for (const x of symbols) {
    let n = root;
    for (const part of x.category.split(/\s*\/\s*/).filter(Boolean)) {
      const path = n.path ? `${n.path} / ${part}` : part;
      let c = n.children.find(k => k.path === path);
      if (!c) { c = { name: part, path, items: [], children: [] }; n.children.push(c); }
      n = c;
    }
    n.items.push(x);
  }
  const sort = (n: TreeNode) => { n.children.sort((a, b) => a.name.localeCompare(b.name)); n.children.forEach(sort); };
  sort(root);
  return root.children;
}
export const countOf = (n: TreeNode): number => n.items.length + n.children.reduce((a, c) => a + countOf(c), 0);
export const categoriesOf = (n: TreeNode): string[] => [...(n.items.length ? [n.path] : []), ...n.children.flatMap(categoriesOf)];

