# 2. La interfaz

![La ventana de OpenWiring con sus partes numeradas](../img/it/interfaccia.png)

*La ventana de OpenWiring con el proyecto de ejemplo (interfaz en italiano).*

| N.º | Parte | Para qué sirve |
|---|---|---|
| 1 | Barra de menús | todos los comandos: *Archivo, Editar, Ver, Insertar, Proyecto, Listas, Ayuda* |
| 2 | Barra de herramientas | los comandos de dibujo más usados |
| 3 | Árbol del modelo | páginas, dispositivos, estructura =/+, regletas, cables, artículos del proyecto |
| 4 | Propiedades | los datos del elemento seleccionado, de la página o del proyecto |
| 5 | Área de dibujo | la página de esquema actual |
| 6 | Biblioteca | símbolos, macros y artículos para insertar |
| 7 | Vista de informe | mensajes de importación, exportación y operaciones |
| 8 | Barra de estado | indicaciones sobre el comando activo, archivo, página, coordenadas del cursor |
| 9 | Pestañas de las vistas | Esquema, Dispositivos, PLC, Regletas, Artículos, Listas |

## Barra de menús

![El menú Archivo](../img/it/menu-file.png)

*El menú Archivo: proyectos, importación y exportación.*

Cada comando del programa está en un menú; junto a las entradas aparecen los atajos de teclado. Con un menú
abierto, las flechas ← → pasan al menú contiguo y Esc lo cierra.

| Menú | Contiene |
|---|---|
| *Archivo* | nuevo, abrir, guardar, proyecto de ejemplo, páginas en texto para asistentes IA, **Importar** (artículos EDZ/XML/CSV, símbolos QElectroTech, esquema desde PDF, macros, comparación) y **Exportar** (PDF, impresión, DXF, etiquetas, PLCopen, artículos, diccionario) |
| *Editar* | deshacer y rehacer, cortar, copiar, pegar, duplicar, eliminar, seleccionar todo, girar, reflejar, buscar y reemplazar |
| *Ver* | vistas, ajustar página, página anterior y siguiente, tema claro u oscuro, hoja blanca u oscura, idioma de los esquemas, idioma de la interfaz, textos bajo los iconos |
| *Insertar* | hilo, cable, recuadro de cuadro, texto, imagen, bus de conductores, conexiones de red por protocolo, páginas de todo tipo, páginas automáticas |
| *Proyecto* | propiedades, propiedades definidas por el usuario, verificación, asistente IA, renumeraciones, cajetín, ubicaciones, redes IP, traducciones, revisiones, modelos |
| *Listas* | comprobaciones, traducciones y todas las listas del proyecto, PDF completo |
| *Ayuda* | manual, atajos, guía para agentes IA, sitio del proyecto, información (versión, autor, marcas y datos de terceros) |

![El menú Proyecto](../img/it/menu-progetto.png)

*El menú Proyecto.*

## Barra de herramientas

![La barra de herramientas](../img/it/barra-strumenti.png)

| Botón | Acción |
|---|---|
| *Nuevo, Abrir, Guardar* | gestión del archivo del proyecto |
| *Deshacer, Rehacer* | ⌘Z y ⇧⌘Z |
| *Seleccionar* | vuelve a la selección (también con Esc) |
| *Hilo* | dibuja hilos (tecla **W**) |
| *Bus* y la lista de protocolos | dibuja una conexión de red (Profinet, EtherCAT, Modbus…) |
| *Bus hilos* | agrupa los hilos en un bus de conductores ([capítulo 5](05-disegnare.md#bus-de-conductores)) |
| *Cuadro* | recuadro de un cuadro en el esquema de red |
| *Cable* | línea de definición de cable |
| *Texto* | texto libre en la página |
| *Girar, Eliminar* | sobre la selección (teclas **R** y **Supr**) |
| *Ajustar* | muestra toda la página (tecla **F**) |
| *Buscar* | buscar y reemplazar (⌘F) |
| *Verificación* | comprobaciones del proyecto |
| *EDZ* | importa artículos de fabricantes |
| *PDF* | exporta el proyecto a PDF |

Desactivando *Ver ▸ Textos bajo los iconos*, la barra se convierte en una sola fila de iconos, más baja.

## Árbol del modelo

![El árbol del modelo](../img/it/albero.png)

El árbol muestra el proyecto y se abre o se cierra con los triángulos ▸ ▾:

- **Páginas**, agrupadas por ubicación (cuadro, botonera…): un clic abre la página.
- **Dispositivos**, agrupados por ubicación: un clic va al dispositivo y lo selecciona.
- **Estructura =Instalación +Ubicación**: los dispositivos por función y ubicación (consulta el [capítulo 7](07-dispositivi-e-articoli.md#estructura-instalación-ubicación)).
- **Regletas** y **Cables**: un clic abre la regleta o selecciona la línea del cable.
- **Artículos del proyecto**: los artículos usados.

Debajo del árbol están los botones de las páginas: *+ Página*, *+ Portada*, *+ Unifilar*, *+ Red*,
*+ Disposición*, *⧉* (duplicar la página), *↑ ↓* (mover) y *✕* (eliminar).

## Propiedades

El panel muestra los datos de lo que está seleccionado:

- **nada seleccionado**: la página actual y, debajo, los datos del proyecto;
- **un símbolo**: sigla, datos del dispositivo, pedido, puntos de conexión, posición;
- **un hilo**: número de hilo, red, conexiones, sección, color;
- **varios elementos**: los campos comunes.

Se escribe en el campo y se confirma con Intro o saliendo del campo. Los valores en gris cursiva son
sugerencias o valores tomados del artículo.

## Biblioteca

![La biblioteca de símbolos](../img/it/libreria-simboli.png)

La columna derecha tiene tres pestañas:

- **Símbolos**: los símbolos IEC 60617 divididos por categoría (bobinas y contactos, mandos, protecciones,
  receptores, bornes y conexiones, PLC, redes y buses, unifilar), más los que importes o dibujes. El campo
  *Buscar…* filtra por nombre.
  Arriba están los **★ Favoritos**: la estrella ☆ de un símbolo (o el botón derecho en un componente ▸
  *Añadir a favoritos*) lo pone aquí. Los favoritos valen para todos los proyectos.
- **Macros**: los circuitos guardados para reutilizarlos (consulta el [capítulo 13](13-macro-simboli-cartigli.md)).
- **Artículos**: la biblioteca de artículos de los fabricantes.

## Menú del botón derecho

![El menú del botón derecho](../img/it/menu-contestuale.png)

El clic derecho sobre un elemento abre los comandos más usados: cortar, copiar, pegar aquí, duplicar,
girar, reflejar, eliminar, crear macro a partir de la selección, **copiar propiedades** y **pegar propiedades de -X** (todos los datos del dispositivo salvo la sigla, [capítulo 7](07-dispositivi-e-articoli.md#copiar-las-propiedades)), modificar el componente, añadir a favoritos, resaltar potencial (en
los hilos), ir al elemento principal o a los contactos, añadir nivel (en los bornes), seleccionar todo,
buscar, duplicar página, ajustar a la ventana.

## Vistas

Las pestañas de arriba a la derecha cambian la parte central:

| Vista | Contenido |
|---|---|
| *Esquema* | la página de dibujo |
| *Dispositivos* | el navegador de dispositivos en forma de tabla |
| *PLC* | tarjetas, direcciones y lista de E/S |
| *Regletas* | el navegador de regletas |
| *Artículos* | la gestión de artículos |
| *Listas* | comprobaciones, traducciones y todas las listas |

## Moverse por el dibujo

| Acción | Cómo |
|---|---|
| Acercar y alejar | rueda del ratón, alrededor del cursor (en el trackpad: pellizco) |
| Desplazar la vista | botón central del ratón, o **Alt** + arrastrar |
| Ver toda la página | **F** o *Ajustar* |
| Página anterior o siguiente | **RePág** / **AvPág** |
| Ir a una referencia | clic en una referencia como `/2.4` |

## Tema, hoja e idioma

*Ver ▸ Tema* elige una interfaz clara, oscura o como el sistema. *Ver ▸ Hoja de dibujo* elige una hoja
blanca u oscura (como en los CAD con fondo negro). PDF, DXF e impresión son siempre sobre hoja blanca.
*Ver ▸ Language · Lingua* elige el idioma de la interfaz: italiano, inglés, francés, alemán o español.
