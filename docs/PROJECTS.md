# Проекты Vela

Создайте готовый проект: `vela init "новый проект" --name hello`.
Команда создаёт manifest/lock, main и именованный test; каталог должен быть новым,
а родитель — существовать. `--kind library` добавляет `lib.vela` и runnable demo.
`--json` выдаёт машинный отчёт. Повторная команда и конфликт файлов отклоняются;
недопустимое ASCII-имя получает E225 с допустимым предложением. Пробелы/Unicode
разрешены в пути. [Контракт](contracts/PROJECT-INIT-1.2.md).
`vela init --help` и `vela init --help --json` показывают справку до любых
файловых операций. Diagnose-план может предложить проверенную нормализацию имени
или однозначную правку ключа; явный relock остаётся отдельным действием.
[Контракт исправлений](contracts/DIAGNOSTIC-PLANS-1.2.md).

Либо создайте `vela.project` вручную:

```
vela-project|1
name|hello
entry|main.vela
test|tests/smoke.vela
dep|math|../math/lib.vela
```

В коде: `import "@math" as math;`. Public API библиотеки объявляется через pub.
Зависимость — локальный модуль, а не вложенный пакетный манифест.
Пути используют `/`; пробелы и Unicode допустимы. Подробности:
[формат](contracts/PROJECT-FORMAT.md), [модули](contracts/MODULES.md).

После проверки изменений библиотек выполните `vela lock vela.project`.
Команды `vela check vela.project --json`, `vela build vela.project -o hello.exe`,
`vela run vela.project`, `vela test vela.project --json` работают нативно.
Тестовые файлы содержат test "name" { ... }; каждый тест запускается отдельно.
Файл без таких деклараций запускает main как legacy-тест. JSON-отчёт имеет schema 2.
`vela fmt vela.project --check` проверяет собственные файлы, `--write` форматирует.
Plain `.vela` файлы продолжают работать без манифеста.

`vela.cmd` и `velac.cmd` запускают один native compiler. Исторический прототип
0.2 и его Python entry point удалены из текущего дерева. Для сборки требуется C11 toolchain; Windows wrappers
находят MSVC. Python, Node.js и MCP не нужны. Обычная самосборка:
`vela-dev.cmd verify`; compiler entry — `selfhost/vela.project`.
`sources.list` используется bundler только для автономного recovery bundle.

Lock обновляется явно. Изменение любого файла графа библиотеки требует relock;
изменение собственного main — нет. Перенос одинакового дерева сохраняет lock.
В `check`, `emit-c` и `build` опциональный `--cache DIR` использует
доверенный локальный каталог. Неизменённые модули повторно используют
разобранные импорты, а неизменённый граф — успешную проверку или C.
Проверки lock и запуск C toolchain при build выполняются каждый раз.
На Windows [build-batch](../tools/build-batch.vela) запускает независимые
корни в отдельных процессах и каталогах. [Контракт](contracts/INCREMENTAL-BUILD.md).

С 1.0.0-dev.2 добавьте `--cache-report` к check/emit-c/build с `--cache DIR`,
чтобы увидеть hit/miss и результат публикации как JSON Lines в stderr.
Конечный каталог создаётся, если существует родитель. Отказы каталога и записи
предупреждают даже без флага; stdout и результат проверки сохраняются.

Для [FFI ABI 1](contracts/FFI.md) Windows x64 добавьте, например,
native|adapter.dll|native/adapter.dll. Манифест явно перечисляет готовые доверенные
DLL; сборка C-исходников и поиск библиотек не подразумеваются. Lock фиксирует SHA-256
их точных байтов. build/run/test копируют эти файлы рядом с executable; одинаковый
файл допустим, отличающийся существующий файл сохраняется и приводит к ошибке.
DLL исходного проекта защищены от перезаписи выходным executable. Для standalone
build можно вручную положить DLL рядом с результатом; run/test требуют манифест.
Рабочий header остаётся `vela-project|1`. Старая native-запись продолжает
работать. Для явного target/ABI укажите
`native|adapter.dll|native/adapter.dll|windows-x64|1|shared`.
Ресурс `resource|assets/settings.json|data/settings.json` копируется рядом с
программой по заявленному пути. Lock включает SHA-256. Получите базовый каталог
через `std/path::resource_base()`. [Контракт поставки](contracts/PACKAGING.md).

Для проекта с `@alias` проверяйте **манифест**: `vela check vela.project --json`
или MCP `vela_check` с `path="vela.project"`. Проверка отдельного файла не ищет
соседний манифест и не получает его alias, поэтому E221 в этом случае ожидаем.
`entry` и `test` должны находиться внутри каталога проекта; `dep` может ссылаться
на соседнюю библиотеку. Корень workspace MCP должен охватывать оба каталога.
После принятого форматирования файла зависимости также требуется просмотр изменений
и `vela lock`: lock фиксирует байты содержимого, а не только публичные сигнатуры.
