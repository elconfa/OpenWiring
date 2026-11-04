# 19. Командная строка и агенты

Эта глава для тех, кто автоматизирует работу: скрипты, проверки перед сдачей, агенты искусственного
интеллекта с доступом к терминалу (Claude Code, Codex, Gemini CLI).

## Руководство для агентов

*Справка ▸ Руководство для ИИ-агентов (.md)…* сохраняет файл Markdown, который объясняет агенту, как читать, писать,
проверять и изменять схемы OpenWiring: порядок работы, правила, соглашения об обозначениях, типовые
схемы, полный синтаксис текстового формата, пример, смысл проверок, порядок перерисовки
схем из PDF (SEE Electrical, EPLAN, AutoCAD) и каталог символов с точками подключения. Копия
есть и в репозитории: `docs/AGENTE_IA.md`.

## Команды

В папке с исходниками OpenWiring, после `npm ci`:

```bash
npm run -s cli -- esporta progetto.ecad --pagine 2,3 --catalogo > pagine.txt
npm run -s cli -- controlla progetto.ecad pagine.txt     # errori con il numero di riga e verifica
npm run -s cli -- applica progetto.ecad pagine.txt       # crea il progetto se non esiste
npm run -s cli -- verifica progetto.ecad [--json]
npm run -s cli -- importa-pdf schema.pdf [uscita.ecad]
npm run -s cli -- guida > AGENTE_IA.md
```

| Команда | Что делает |
|---|---|
| `esporta` | записывает страницы в текстовом формате; `--pagine` выбирает страницы, `--catalogo` добавляет каталог символов |
| `controlla` | проверяет текст, не изменяя проект: ошибки с номером строки и проблемы проверки на затронутых страницах |
| `applica` | применяет текст к проекту (заменяет или добавляет страницы); создаёт файл, если его нет |
| `verifica` | проверки проекта, в том числе в JSON для скриптов |
| `importa-pdf` | восстанавливает проект из схемы в векторном PDF |
| `guida` | руководство для агентов |

Страницы, сформированные программой (обзоры ПЛК, схемы клеммников, списки, компоновка, титульный лист),
экспортируются только в виде заголовка.

## Текстовый формат

Одна строка на элемент, координаты в мм на листе A3, сетка 4 мм:

| Строка | Пример |
|---|---|
| `progetto` | `progetto nome="Linea 3" cliente="Rossi Spa"` |
| `luogo` | `luogo +Q1 "Quadro master" tipo="Quadro elettrico"` |
| `cavo` | `cavo -1W1 tipo=FG16OR16 sezione=1,5 conduttori="BN BK GY GNYE" lunghezza=15` |
| `scheda` | `scheda -3A1 tipo=cpu-14di-10do-2ai stazione=PLC1` |
| `simbolodef` | символ-прямоугольник с точками подключения для компонентов, которых нет в каталоге |
| `pagina` | `pagina 7 "Ventilazione" tipo=schema luogo=Q1` |
| `simbolo` | `simbolo coil -7K1 @100,140 descr="Contattore" dati="24 V DC"` |
| `filo` | `filo 100,24 100,60 sezione=1,5 colore=BU` |
| `collega` | `collega -7S1:14 -7K1:A1` (программа сама вычисляет трассу) |
| `testo` | `testo @40,250 h=3 "Nota"` |
| `riquadro`, `lineacavo` | рамки сетевой схемы и линии кабелей |

Экспортированный текст описывает в комментариях каждую точку подключения с координатами и для каждого провода —
что он соединяет и его номер. Экспорт и повторный импорт без изменений дают тот же проект.
