# Проекты Vela 0.7.0

Создайте `vela.project`:

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

`vela.cmd` и `velac.cmd` запускают один native compiler; `vela-python.cmd` —
исторический прототип 0.2. Для сборки требуется C11 toolchain; Windows wrappers
находят MSVC. Python, Node.js и MCP не нужны. Обычная самосборка:
`vela-dev.cmd verify`; compiler entry — `selfhost/vela.project`.
`sources.list` используется bundler только для автономного recovery bundle.

Lock обновляется явно. Изменение любого файла графа библиотеки требует relock;
изменение собственного main — нет. Перенос одинакового дерева сохраняет lock.
Нет registry, загрузки из сети или сложного incremental cache.

Для [FFI ABI 1](contracts/FFI.md) Windows x64 добавьте, например,
native|adapter.dll|native/adapter.dll. Манифест явно перечисляет готовые доверенные
DLL; сборка C-исходников и поиск библиотек не подразумеваются. Lock фиксирует SHA-256
их точных байтов. build/run/test копируют эти файлы рядом с executable; одинаковый
файл допустим, отличающийся существующий файл сохраняется и приводит к ошибке.
DLL исходного проекта защищены от перезаписи выходным executable. Для standalone
build можно вручную положить DLL рядом с результатом; run/test требуют манифест.
Рабочий header остаётся `vela-project|1`: поддержанная native-запись содержит
только имя DLL и относительный путь. Многопольные native-записи и resource-записи
из раннего дизайна [NATIVE-RESOURCES](contracts/NATIVE-RESOURCES.md) не реализованы.
Текстовые ресурсы/встраивание и их связь с lock остаются планом 0.9.7/0.11.6.

Для проекта с `@alias` проверяйте **манифест**: `vela check vela.project --json`
или MCP `vela_check` с `path="vela.project"`. Проверка отдельного файла не ищет
соседний манифест и не получает его alias, поэтому E221 в этом случае ожидаем.
`entry` и `test` должны находиться внутри каталога проекта; `dep` может ссылаться
на соседнюю библиотеку. Корень workspace MCP должен охватывать оба каталога.
После принятого форматирования файла зависимости также требуется просмотр изменений
и `vela lock`: lock фиксирует байты содержимого, а не только публичные сигнатуры.
