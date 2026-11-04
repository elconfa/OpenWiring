# 20. Atajos, archivos y problemas

## Atajos de teclado

En Windows se usa **Ctrl** en lugar de **⌘**. *Ayuda ▸ Atajos e información* los resume.

| Tecla | Acción |
|---|---|
| **W** | dibujar hilo |
| **R** | girar la selección, o el símbolo que se inserta |
| **F** | ajustar la página a la ventana |
| **Supr**, Retroceso | eliminar la selección |
| **Esc** | terminar el comando actual |
| **Flechas** | mover la selección 4 mm (con ⇧ 16 mm) |
| **RePág**, **AvPág** | página anterior, siguiente |
| ⌘Z, ⇧⌘Z (Ctrl+Y) | deshacer, rehacer |
| ⌘C, ⌘X, ⌘V | copiar, cortar, pegar (también en otro proyecto) |
| ⌘D | duplicar la selección |
| ⌘A | seleccionar todo en la página |
| ⌘F | buscar y reemplazar |
| ⌘S, ⇧⌘S, ⌘O | guardar, guardar como, abrir |
| ⌘P | imprimir |
| ⌘I | abrir o cerrar el asistente IA |
| Rueda | zoom alrededor del cursor |
| Botón central, **Alt** + arrastrar | mover la vista |
| **Mayús** + clic | añadir o quitar un elemento de la selección |
| Botón derecho | menú contextual; durante la inserción termina el comando |

## Archivos

| Extensión | Contenido |
|---|---|
| `.ecad` | proyecto OpenWiring: páginas, elementos, ajustes, artículos y símbolos usados, en un archivo JSON legible |
| `.ecmacro` | macro para intercambiar |
| `.edz`, `.xml`, `.csv` | artículos de los fabricantes (paquetes EDZ, XML en formato EPLAN, CSV de datos comerciales) |
| `.elmt`, `.qet` | componentes de QElectroTech |
| `.pdf` | esquemas y listas; también como origen para importar desde otros CAD |
| `.dxf` | páginas, placa de taladrado, cajetines que importar |
| `.xlsx`, `.csv` | listas, dispositivos, variables PLC, etiquetas, diccionario |
| `.txt` | páginas en formato de texto |

La **biblioteca personal** (artículos, símbolos importados, macros, cajetines, modelos de proyecto) se guarda
en el programa en ese ordenador. Los elementos usados en un proyecto se copian en el archivo `.ecad`, así el
proyecto se abre completo también en otro sitio.

## Preguntas frecuentes

**Un hilo parece conectado pero la verificación dice que no lo está.**
El hilo pasa por encima del punto de conexión sin terminar en él. Arrastra el extremo del hilo sobre el
punto, o borra el hilo y vuelve a dibujarlo terminando en el punto (el pequeño círculo verde).

**Dos hilos se cruzan: ¿están conectados?**
No, salvo que haya el punto de unión. Para conectarlos, haz que un hilo termine sobre el otro.

**El contacto no muestra la referencia a la bobina.**
El contacto debe tener la misma sigla que la bobina. Comprueba la sigla en las propiedades del contacto.

**He añadido un componente y los números de hilo han cambiado.**
Ocurre con la numeración *recalculada*. Con la numeración *bloqueada* (predeterminada) los números
existentes no cambian.

**El número de hilo cambia después de un borne.**
En las propiedades del borne comprueba *Número de hilo ▸ El número de hilo pasa*.

**Un punto de interrupción muestra `/?` en rojo.**
Falta el punto de interrupción correspondiente con el mismo nombre en otra página.

**El PDF no contiene las listas.**
Marca *Listas al final* en la ventana del PDF, o crea las páginas de lista.

**La aplicación no se abre en macOS.**
Ver [Instalación](01-introduzione.md#macos): *Ajustes del Sistema ▸ Privacidad y seguridad ▸ Abrir
igualmente*.

**El asistente IA responde que el acceso a la cuenta ha caducado.**
Ejecuta en el Terminal el comando indicado (por ejemplo `codex login`) y vuelve a intentarlo.

**El componente QElectroTech importado no funciona.**
Probablemente se guardó la página web de GitHub en lugar del archivo: descarga con *Raw*.

**He perdido el trabajo tras un cierre repentino.**
Al volver a abrirlo, el programa propone el último proyecto en el que trabajabas. Aun así, guarda a menudo
con ⌘S.
