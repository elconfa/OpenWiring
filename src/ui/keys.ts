/** Tasto modificatore mostrato nei suggerimenti e nei menu: ⌘ su macOS, Ctrl+ su Windows/Linux */
export const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const K = (k: string, shift = false) => (MAC ? `${shift ? '⇧' : ''}⌘${k}` : `Ctrl+${shift ? 'Maiusc+' : ''}${k}`);
