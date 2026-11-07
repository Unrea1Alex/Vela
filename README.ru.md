# Vela

**Vela 1.0.0** фиксирует язык, основной stdlib, формат проекта, публичный FFI и
протоколы инструментов. Реализованы группы задач с await HTTP/process,
наблюдаемый кэш, общая Windows GUI-библиотека, расширенный HTTP API и равенство
enum без полей. Компилятор и чистая сборка из C seed прошли по **1214 native-проверок**.
[Контракт API](docs/contracts/STABLE-1.0.md),
[политика совместимости](docs/COMPATIBILITY.md) и [миграция](docs/MIGRATING-1.0.md).
[Приёмка 1.0](docs/VALIDATION-1.0.md) описывает проверки платформ и поставки;
архивы 0.11 сохранены.

## Скачать 1.0.0

- [Windows x64](https://github.com/Unrea1Alex/Vela/releases/download/v1.0.0/vela-1.0.0-windows-x64.zip) — компилятор, инструменты, исходники, C seed и GUI-примеры; сборка исходников требует MSVC.
- [Linux x64](https://github.com/Unrea1Alex/Vela/releases/download/v1.0.0/vela-1.0.0-linux-x64-musl.tar.gz) — статический компилятор, stdlib, standalone-исходник и C seed; консольная платформа.
- [MCP](https://github.com/Unrea1Alex/Vela/releases/download/v1.0.0/vela-mcp-1.0.0.zip) — отдельный адаптер для Node.js 24+, используется с соответствующей Windows-поставкой.

[Описание релиза](https://github.com/Unrea1Alex/Vela/releases/tag/v1.0.0) ·
[Контрольные суммы SHA-256](https://github.com/Unrea1Alex/Vela/releases/download/v1.0.0/SHA256SUMS-1.0.0.txt)

[English](README.md) · [Лицензия MIT](LICENSE)

Vela компилирует программы через C11. Компилятор, сборщик и стенд написаны на Vela.
В 0.9 появились семантические запросы, проверяемые планы правок, нативный
LSP, многострочные raw-строки, переносы в форматтере и выдача файлов через MCP.
MeasureLab генерирует автономный HTML из raw-строк. Полная матрица проверяется
на Windows x64/MSVC. Для Linux x86-64/GCC предусмотрена консольная поставка.
[Спецификация](docs/LANGUAGE.md) · [План](docs/ROADMAP.md) ·
[MCP](integrations/mcp/README.md).

В Vela 0.10 доступны [закрытые структуры](docs/contracts/ENCAPSULATION.md),
[методы](docs/contracts/METHODS.md), [интерфейсы](docs/contracts/INTERFACES.md)
и [замыкания](docs/contracts/CALLABLES-EFFECTS.md).
Приложение [Notes](apps/gui-notes/README.md) использует подменяемый файловый
сервис и нативные callbacks. [Приёмка 0.10](docs/VALIDATION-0.10.md).

В 0.11 появились типизированные async-задачи, HTTP/HTTPS, кэш проверки,
отладочный экспорт и ресурсы рядом с exe. [FieldDesk](apps/fielddesk/README.md)
загружает измерения по HTTPS, поддерживает отмену и сохраняет пользовательские
правки, сделанные во время запроса. [Матрица платформ](docs/contracts/PLATFORM-SUPPORT.md).

[PulseDeck](apps/pulse-deck/README.md) использует группы задач и await HTTP/HTTPS:
параллельные проверки сервисов, async-задержки, отмену, нативное окно и JSON-отчёт.
Демонстрационный сервер написан на Vela, для демо интернет не нужен.

## Быстрый старт

Из корня проекта в PowerShell:

~~~powershell
.\velac.cmd --version
.\velac.cmd fmt examples/collections.vela --check
.\velac.cmd run examples/collections.vela
.\velac.cmd build examples/factorial.vela -o bin/my-factorial.exe
.\bin\my-factorial.exe 10
.\vela-dev.cmd verify
~~~

Для сборки нужен C11-компилятор. Обёртки автоматически настраивают MSVC x64.
`check`, `symbols`, `emit-c` и готовые программы работают без C-компилятора.
Python в этих командах не используется.

Для подсветки файлов `.vela` в VS Code установите [расширение Vela Language](integrations/vscode/README.md).

Небольшое готовое приложение: [TimeLog](apps/timelog/README.md) читает TSV-журнал
времени и создаёт автономный HTML-отчёт. [Разбор прикладной проверки](docs/TIMELOG-REVIEW.md)
содержит найденную ошибку форматтера и предложения для стандартной библиотеки.
[MeasureLab](apps/measurelab/README.md) читает JSON, считает статистику и создаёт HTML/SVG.
[Демо-отчёт](apps/measurelab/report.html) использует синтетические данные.

## Возможности языка

- Статические типы, структуры, enum и исчерпывающий `match`; номинальные `distinct` ID.
- Generic-функции и типы, `List<T>`, `Dict<K,V>`, Option/Result и распространение ошибок через `?`.
- Явные эффекты, runtime-контракты, проверяемая целочисленная арифметика и Float64.
- Точный GC, лексическая очистка через `scope`/`defer` и явное закрытие внешних ресурсов.
- Закрытые структуры, методы, номинальные интерфейсы, функции как значения и замыкания.
- Типизированные async-задачи, группы задач и await HTTP/process на Windows.
- Общая Windows GUI-библиотека, HTTP/HTTPS-клиент и loopback-сервер.
- JSON, текстовые builder, CLI, файлы, процессы и именованные тесты.
- Модули, локальные зависимости, lock-файлы и ресурсы рядом с исполняемым файлом.
- Форматтер, JSON-диагностика, семантические запросы, проверяемые планы правок и LSP.

[Pipeline](examples/pipeline.vela) показывает обработку данных и ошибок.
Точные правила: [язык](docs/LANGUAGE.md), [stdlib](docs/STDLIB.md),
[архитектура](docs/ARCHITECTURE.md) и [проекты](docs/PROJECTS.md).

~~~text
type NodeId = distinct Int;
struct Node { id: NodeId, name: String }

fn main() -> Unit effects { state, io } {
    let nodes = list_new<Node>();
    list_push(nodes, Node(name: "root", id: NodeId(1)));
    let names = dict_new<NodeId, String>();
    dict_set(names, NodeId(1), list_get(nodes, 0).name);
    print("Node: " + dict_get(names, NodeId(1)));
}
~~~

Структуры копируются по значению. Коллекции имеют общую изменяемую идентичность:
все операции чтения и изменения требуют `state`. Разные номинальные ID
несовместимы; преобразование выполняется явно через конструктор и `.value`.
Подробности и ограничения: [язык](docs/LANGUAGE.md), [память](docs/MEMORY.md).

Сохранены функции, рекурсия, перечисления с данными, исчерпывающий `match`,
контракты, эффекты, проверяемая арифметика, файлы, Unicode пути и аргументы,
старые `IntList` / `StringList`.

## Рабочий цикл

Редактируйте авторские файлы из `selfhost/sources.list`, runtime и каталог.
Не редактируйте генерируемый `selfhost/compiler.vela` вручную.

| Команда | Действие |
|---|---|
| `vela-dev.cmd bundle` | Пересобрать сборщик и автономный исходник |
| `vela-dev.cmd bootstrap` | Три поколения компилятора и проверка сходимости; без тестов |
| `vela-dev.cmd test` | Пересобрать стенд и проверить установленный компилятор |
| `vela-dev.cmd verify` | Самосборка, сходимость, полный стенд; установка после успеха |

Сравнивается C от второго и третьего поколений побайтно. Дополнительно сборщик,
собранный новым компилятором, должен создать тот же автономный исходник.
Логи, поколения и отчёты находятся в `build/native/`; краткие подтверждения —
в `docs/bootstrap-evidence.json` и `docs/test-evidence.json`.

Нативные инструменты: `tools/bundle.vela`, `tools/dev.vela`, `tools/test.vela`.
`.cmd` только настраивает окружение MSVC и запускает executable. Самосборка требует
предыдущий рабочий `bin/velac.exe`. В поставке также есть самостоятельный
C-исходник компилятора для восстановления через C11 без Python.

## Команды компилятора

| Команда | Результат |
|---|---|
| `check SOURCE [--json]` | Проверка языка |
| `symbols SOURCE` | JSON-индекс типов, полей, функций, эффектов и контрактов |
| `fmt SOURCE [--check\|--write]` | Форматирование, проверка стиля или атомарная запись |
| `emit-c SOURCE [-o program.c]` | Самостоятельный C11 со встроенным runtime |
| `build SOURCE -o program.exe` | Сборка с сохранением старого файла при ошибке |
| `run SOURCE -- ARGUMENTS` | Временная сборка и запуск |

## Границы

Прикладной пример [SourceLens](apps/source-lens/README.md) превращает семантический
индекс проекта в автономный HTML с поиском функций, вызовов и
эффектов. Проверены raw-шаблоны, CLI/LSP-переименование и выдача отчёта через MCP.

Контракты проверяются при выполнении. Достижимые значения удерживает точный GC.
Ресурсы закрываются явно. LLVM/WASM остаются планами. Кэш 0.11 повторно использует
неизменённый граф; изменённый граф целиком проходит семантическую проверку.
Generic-тела проверяются при инстанцировании. Функции как значения, замыкания
и typed async реализованы. HTTP/process можно ожидать через `async_io` в области
группы задач; пул HTTP-соединений и переносимый GUI остаются планами.
For по списку создаёт поверхностный снимок;
для обхода без такой копии доступны диапазоны индексов.

Полная проверенная матрица — Windows x64 / MSVC. Linux x86-64/GCC/musl проверен
для консольной поставки и C recovery; Windows GUI, fiber и сетевые адаптеры
не входят в Linux-матрицу. Сходимость и тесты не являются формальным доказательством.

Python-код оставлен как историческая реализация языка 0.2. Он читает тот же
каталог встроенных функций, но не поддерживает новые конструкции 0.3–0.7.
`python -m vela` и `vela-python.cmd` — этот старый frontend из репозитория;
для работы используйте `vela.cmd` или совместимый `velac.cmd`.
Старые Python-скрипты bootstrap/verify теперь лишь перенаправляют к нативным
инструментам и не содержат самостоятельной логики сборки.

[План развития](docs/ROADMAP.md) · [Архитектура](docs/ARCHITECTURE.md) · [Компилятор](selfhost/README.md) ·
[Каталог функций](docs/BUILTINS.md) · [Проверки](docs/VALIDATION.md)
