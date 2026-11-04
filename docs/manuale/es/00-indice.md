# Manual de OpenWiring

OpenWiring es un programa para dibujar esquemas eléctricos industriales según las normas IEC: siglas de los dispositivos, referencias cruzadas, números de hilo, regletas, cables, PLC, listas y
exportación a PDF, DXF y Excel. Este manual explica cada función con ejemplos e imágenes.

Para empezar basta con los capítulos 1–3: en media hora se dibuja el primer esquema. Los demás capítulos se
consultan cuando hacen falta.

> Las imágenes muestran el programa con la interfaz en italiano. El idioma se elige en
> *Ver ▸ Language · Lingua*: menús y ventanas tienen la misma disposición en todos los idiomas.

## Capítulos

| N.º | Capítulo | Contenido |
|---|---|---|
| 1 | [Introducción e instalación](01-introduzione.md) | qué es OpenWiring, instalación, primer arranque, guardar |
| 2 | [La interfaz](02-interfaccia.md) | menús, barra de herramientas, árbol, propiedades, biblioteca, vistas, navegación |
| 3 | [El primer proyecto](03-primo-progetto.md) | ejercicio guiado: mando de una bomba con autorretención |
| 4 | [Proyecto y páginas](04-progetto-e-pagine.md) | datos del proyecto, páginas y tipos de página, ubicaciones, cajetín, propiedades definidas por el usuario, portada, modelos |
| 5 | [Dibujar el esquema](05-disegnare.md) | símbolos, hilos, uniones, potenciales, puntos de interrupción, bus de conductores, textos, imágenes, edición |
| 6 | [Siglas, referencias cruzadas y números de hilo](06-sigle-e-numerazione.md) | IEC 81346, contactos, imagen de contactos, números de hilo, secciones y colores |
| 7 | [Dispositivos y artículos](07-dispositivi-e-articoli.md) | datos de los dispositivos, navegador, estructura =/+, copia de propiedades, artículos, base de datos de artículos, EDZ y CSV |
| 8 | [Regletas](08-morsettiere.md) | bornes, niveles, puentes, reservas, accesorios, esquema de la regleta |
| 9 | [Cables y conectores](09-cavi-e-connettori.md) | línea de definición, conductores, listas de cables, conectores y clavijas, datos de los pines |
| 10 | [PLC](10-plc.md) | tarjetas, puntos de E/S, direcciones, vistas generales, TIA Portal, CODESYS, PLCopen |
| 11 | [Redes, ubicaciones y esquema unifilar](11-reti-luoghi-unifilare.md) | esquema de red, buses, cables de red, plan IP, ubicaciones, unifilar |
| 12 | [Disposición del cuadro](12-layout-quadro.md) | placa, carriles DIN, canaletas, colocación automática, taladrado, longitud de los hilos |
| 13 | [Macros, símbolos y cajetines](13-macro-simboli-cartigli.md) | macros, editor de componentes, QElectroTech, cajetines incluidos y personalizados |
| 14 | [Listas y páginas automáticas](14-liste-e-pagine-automatiche.md) | lista de materiales, lista de compra, listas, páginas de lista, etiquetas |
| 15 | [Verificación, búsqueda y revisiones](15-verifica-ricerca-revisioni.md) | comprobaciones del proyecto, buscar y reemplazar, revisiones, comparación |
| 16 | [Idiomas de los esquemas](16-lingue.md) | diccionario, esquemas en inglés y alemán, dos idiomas a la vez |
| 17 | [Asistente IA](17-assistente-ia.md) | Claude, ChatGPT y Gemini en el programa, formato de texto |
| 18 | [Importación y exportación](18-import-export.md) | PDF, impresión, DXF, Excel, importación desde SEE Electrical, EPLAN, QElectroTech |
| 19 | [Línea de comandos y agentes](19-riga-di-comando.md) | comandos `npm run cli`, guía para agentes IA |
| 20 | [Atajos, archivos y problemas](20-scorciatoie-e-problemi.md) | teclas, formatos de archivo, preguntas frecuentes |

## Convenciones del manual

- *La cursiva con flechas* indica una ruta de menú: *Proyecto ▸ Verificación*.
- **⌘** es la tecla Comando del Mac; en Windows se usa **Ctrl**.
- Las siglas se escriben como en el esquema: `-2K1` (dispositivo), `-X1:3` (borne), `200.01` (número de hilo).
- Los ejemplos usan el **proyecto de ejemplo** «Avviamento motore pompa» (*Archivo ▸ Cargar el proyecto de
  ejemplo*), así cada imagen se encuentra en el programa.

## Marcas y datos de terceros

OpenWiring es un software independiente, no afiliado ni aprobado por EPLAN GmbH & Co. KG, Rittal, SDProget ni por los
fabricantes citados. EPLAN, Eplan Data Portal, SPAC, AutoCAD, Excel, Siemens, Schneider Electric, QElectroTech y los
demás nombres de productos y empresas son marcas de sus respectivos titulares, citadas solo para indicar formatos de
archivo y compatibilidad. OpenWiring no incluye ni distribuye macros, símbolos ni catálogos de los fabricantes: solo
importas los archivos que tienes derecho a usar, respetando sus condiciones de uso. La lectura de los formatos EDZ, XML
y CSV se basa en el análisis de los archivos de datos, con fines de interoperabilidad. La misma información está en
*Ayuda ▸ Información*.
