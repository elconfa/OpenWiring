# 1. Introducción e instalación

## Qué es OpenWiring

OpenWiring es un CAD eléctrico: no se dibujan líneas, sino **dispositivos conectados**. El programa sabe que
el contacto `-2K1 13-14` pertenece a la bobina `-2K1`, que dos hilos unidos por un punto son el mismo
conductor y que el borne `-X1:3` lleva el hilo `1.06` al motor. A partir de esta información obtiene solo:

- las **referencias cruzadas** entre bobinas y contactos, y entre páginas distintas;
- los **números de hilo** y su posición en el esquema;
- las **listas**: lista de materiales, lista de compra, dispositivos, bornes, conexiones, hilos, cables, E/S PLC;
- la **verificación** del proyecto: cortocircuitos, conexiones que faltan, siglas duplicadas;
- las **exportaciones**: PDF con enlaces, DXF, Excel para TIA Portal, etiquetas para las impresoras de marcado.

Los conceptos son los habituales del dibujo eléctrico industrial: siglas IEC 81346, rejilla de 4 mm, páginas A3
de 10 columnas, referencias `/página.columna`, todo con una interfaz sencilla.

## Instalación

El programa se descarga desde la página **Releases** del proyecto en GitHub
(<https://github.com/elconfa/OpenWiring/releases>).

| Sistema | Archivo que descargar |
|---|---|
| macOS con procesador Apple (M1, M2, M3, M4) | `OpenWiring-x.y.z-arm64.dmg` |
| macOS con procesador Intel | `OpenWiring-x.y.z.dmg` |
| Windows 10 y 11, con instalación | `OpenWiring.Setup.x.y.z.exe` |
| Windows, sin instalación (un solo archivo, también desde un pendrive) | `OpenWiring-x.y.z-portable.exe` |
| Windows, sin instalación (carpeta) | `OpenWiring-x.y.z-win.zip` |

### macOS

1. Abre el archivo `.dmg` y arrastra **OpenWiring** a la carpeta *Aplicaciones*.
2. Abre la aplicación una vez: aparece el aviso «Apple no puede verificar…», porque la aplicación no está
   firmada con un certificado de Apple de pago. Cierra el aviso.
3. Abre *Ajustes del Sistema ▸ Privacidad y seguridad*, baja hasta el final, pulsa **Abrir igualmente** y
   confirma. En macOS 14 y anteriores basta con clic derecho en la aplicación ▸ *Abrir* ▸ *Abrir*.

> **Si aparece «OpenWiring está dañado»** (versiones hasta la 0.14.0): abre el Terminal, ejecuta
> `xattr -cr /Applications/OpenWiring.app` y vuelve a abrir la aplicación.

### Windows

Extrae el zip en una carpeta (por ejemplo *Documentos\\OpenWiring-app*) y ejecuta `OpenWiring.exe`. En la ventana azul de SmartScreen elige *Más información ▸ Ejecutar de todas
formas*.

### Idioma de la interfaz

En el primer arranque el programa usa el idioma del sistema si es italiano, inglés, francés, alemán,
español o ruso. Se cambia en cualquier momento con *Ver ▸ Language · Lingua*. El idioma de los esquemas (cajetines,
listas, PDF) es un ajuste aparte: consulta el [capítulo 16](16-lingue.md).

## Primer arranque

En el primer arranque se abre el **proyecto de ejemplo** «Avviamento motore pompa» (arranque del motor de una
bomba), seis páginas listas para explorar:

| Página | Contenido |
|---|---|
| 1 | potencia: guardamotor, contactor, regleta, cable y motor; fuente de alimentación de 24 V |
| 2 | mando: parada de emergencia, marcha con autorretención, pilotos |
| 3 | entradas y salidas del PLC |
| 4 | vista general de la tarjeta PLC, generada por el programa |
| 5 | esquema de red Profinet y Modbus entre dos cuadros |
| 6 | esquema unifilar de la potencia |

Se vuelve a abrir en cualquier momento con *Archivo ▸ Cargar el proyecto de ejemplo*; *Archivo ▸ Nuevo
proyecto* empieza desde una página vacía.

## Guardar el trabajo

- **Guardar** (⌘S) escribe el proyecto en un archivo `.ecad`. *Guardar como…* (⇧⌘S) crea una copia.
- **Abrir** (⌘O) vuelve a abrir un archivo `.ecad`. El archivo contiene todo: páginas, ajustes, símbolos y
  artículos usados.
- El programa guarda además una **copia automática** del último proyecto abierto y la propone al volver a
  arrancar: es una seguridad en caso de cierre imprevisto, no sustituye a *Guardar*.
- La barra de estado inferior muestra el nombre del archivo y un punto `•` cuando hay cambios sin guardar.

## Deshacer

Cada cambio se deshace con **⌘Z** (*Editar ▸ Deshacer*) y se rehace con **⇧⌘Z** (Ctrl+Y en Windows). Se
pueden deshacer hasta 100 pasos, incluso operaciones grandes como aplicar páginas escritas por el asistente
IA o una edición en bloque de muchos dispositivos.
