# 19. Línea de comandos y agentes

Este capítulo es para quien automatiza: scripts, comprobaciones antes de la entrega, agentes de
inteligencia artificial con acceso al terminal (Claude Code, Codex, Gemini CLI).

## La guía para agentes

*Ayuda ▸ Guía para agentes IA (.md)…* guarda un archivo Markdown que explica a un agente cómo leer,
escribir, comprobar y modificar los esquemas de OpenWiring: flujo de trabajo, reglas, convenciones de las
siglas, esquemas típicos, sintaxis completa del formato de texto, ejemplo, significado de las
comprobaciones, procedimiento para redibujar esquemas desde PDF (SEE Electrical, EPLAN, AutoCAD) y catálogo
de símbolos con los puntos de conexión. Hay una copia también en el repositorio: `docs/AGENTE_IA.md`.

## Los comandos

En la carpeta de las fuentes de OpenWiring, después de `npm ci`:

```bash
npm run -s cli -- esporta progetto.ecad --pagine 2,3 --catalogo > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt     # errores con el número de línea, y verificación
npm run -s cli -- applica progetto.ecad pagine.txt       # crea el proyecto si no existe
npm run -s cli -- verifica progetto.ecad [--json]
npm run -s cli -- importa-pdf schema.pdf [uscita.ecad]
npm run -s cli -- guida > AGENTE_IA.md
```

| Comando | Qué hace |
|---|---|
| `esporta` | escribe las páginas en formato de texto; `--pagine` elige las páginas, `--catalogo` añade el catálogo de símbolos |
| `controlla` | comprueba un texto sin modificar el proyecto: errores con el número de línea y problemas de la verificación en las páginas afectadas |
| `applica` | aplica el texto al proyecto (sustituye o añade páginas); crea el archivo si no existe |
| `verifica` | las comprobaciones del proyecto, también en JSON para los scripts |
| `importa-pdf` | reconstruye un proyecto a partir de un esquema en PDF vectorial |
| `guida` | la guía para agentes |

Las páginas generadas por el programa (vistas generales PLC, esquemas de regletas, listas, disposición,
portada) se exportan solo como encabezado.

## El formato de texto

Una línea por elemento, con coordenadas en mm sobre la hoja A3 y rejilla de 4 mm:

| Línea | Ejemplo |
|---|---|
| `progetto` | `progetto nome="Linea 3" cliente="Rossi Spa"` |
| `luogo` | `luogo +Q1 "Quadro master" tipo="Quadro elettrico"` |
| `cavo` | `cavo -1W1 tipo=FG16OR16 sezione=1,5 conduttori="BN BK GY GNYE" lunghezza=15` |
| `scheda` | `scheda -3A1 tipo=cpu-14di-10do-2ai stazione=PLC1` |
| `simbolodef` | un símbolo de caja con sus puntos de conexión, para componentes que no están en el catálogo |
| `pagina` | `pagina 7 "Ventilazione" tipo=schema luogo=Q1` |
| `simbolo` | `simbolo coil -7K1 @100,140 descr="Contattore" dati="24 V DC"` |
| `filo` | `filo 100,24 100,60 sezione=1,5 colore=BU` |
| `collega` | `collega -7S1:14 -7K1:A1` (el programa calcula el recorrido) |
| `testo` | `testo @40,250 h=3 "Nota"` |
| `riquadro`, `lineacavo` | recuadros del esquema de red y líneas de los cables |

El texto exportado describe en comentarios cada punto de conexión con sus coordenadas y, para cada hilo, qué
conecta y el número de hilo. Exportar y volver a importar sin cambios da el mismo proyecto.
