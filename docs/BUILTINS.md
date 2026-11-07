# Общий каталог встроенных функций

Единственный источник сигнатур и классификации ABI — `vela/builtins.def`.
Формат: UTF-8, одна запись на строку, восемь полей, разделитель `|`.
Пустые поля значимы; строка с `#` — комментарий. Quoting/escaping не применяется.

```text
kind|name|type variables|parameters|returns|effects|ABI|since
fn|str_len||String|Int||located|0.2
fn|list_push|T|List<T>;T|Unit|state|list_push|0.3
enum|IntResult||Ok:Int;Err:String||||0.2
enum|Option|T|Some:T;None:||||0.5
enum|Result|T;E|Ok:T;Err:E||||0.5
```

- `kind`: `fn` или `enum`.
- `name`: имя декларации в Vela, уникальное в каталоге.
- `type variables`: имена параметров типа через `;`, например `K;V`.
- `parameters`: для функции — типы через `;`; для enum — варианты через `;`,
  поля варианта после `:` через `,`. У варианта без данных после `:` пусто.
- `returns`: тип результата функции.
- `effects`: эффекты через `;`; пусто означает чистую функцию.
- `ABI`: способ понижения вызова.
- `since`: версия появления; исторический Python frontend читает функции 0.2
  и негeneric enum. Generic enum считываются из того же формата нативным frontend.

Option/Result не меняют сигнатур старых функций: `read_file` по-прежнему возвращает
StringResult, `write_file` — WriteResult, `parse_int` — IntResult. Для использования
`?` выполняется явный match-адаптер, как `from_string`/`from_write` в compiler/tools.

Пробелы внутри типов не нужны: `Dict<K,List<V>>`. Пользовательский parser
разрешает пробелы и канонизирует написание типов.

| ABI | Понижение |
|---|---|
| `plain` | `v_NAME(arguments)` |
| `located` | `v_NAME(arguments, file, line, column)` |
| `int_result` | Legacy parse result без координат, обёртка в `IntResult` |
| `float_result` | Числовой результат с координатами, обёртка в `FloatResult` |
| `int32_result` | Проверенное сужение Int → Int32Result с координатами |
| `read_result` | Ограниченное чтение: ReadResult::Ok/Limit/Err |
| `spawn_result` | Дескриптор рабочей группы Windows или ошибка запуска |
| `fiber_result` | Дескриптор приостанавливаемой задачи Windows с типизированным callable |
| `process_result` | ProcessResult::Exited/TimedOut/Err; реальный exit 124 не является тайм-аутом |
| `string_result` / `write_result` | Вызов с координатами, обёртка результата ОС |
| `print` / `format` | Скаляр или distinct-обёртка, конкретное форматирование |
| `list_*` / `dict_*` | Типизированные intrinsic-операции с размерами и копиями значений |

Нативный сборщик проверяет форму строк, дубликаты, эффекты и известные ABI.
Нативный compiler читает встроенную копию файла; Python читает packaged resource.
Изменение файла начинает действовать в следующем поколении компилятора после
`vela-dev.cmd verify`. Готовый `velac.exe` не зависит от внешнего файла каталога.

Если новый builtin используется самим compiler, сначала собрать переходное
поколение со свежим каталогом/runtime и прежними вызывающими участками, проверить
его, затем собирать зависимую реализацию. Старое поколение не знает новые сигнатуры.

В первой сборке 0.11 `monotonic_millis` возвращает миллисекунды монотонных часов
с произвольной точкой отсчёта. `process_spawn` принимает argv с абсолютным путём
к exe, абсолютный cwd и два разных абсолютных пути вывода. `process_poll`
возвращает `Ok(-1)` для живой группы или код завершения главного процесса
после завершения всей группы. `process_cancel` запрашивает остановку.
`process_close` освобождает только завершённую группу. С dev.2
`SpawnResult::Ok` означает принятую операцию, а ошибка открытия файлов
или создания процесса приходит через `process_poll`.

`host_sleep(ms)` с эффектом `io` приостанавливает поток хоста на 0..1000 мс
и возвращает `WriteResult`. Он предназначен для ожидания между опросами
внешних задач. Внутри `async fn` используйте `await sleep_ms(ms)`.

`panic(message: String)` требует `process`, выводит позицию вызова и
сообщение в stderr и завершает процесс с кодом 70. Прямой вызов как
оператор завершает путь функции с любым типом результата.
См. [отладку](contracts/DEBUGGING.md).

`executable_path()` с эффектом `io` читает путь текущего образа из ОС.
`canonical_path(path, regular_file)` возвращает разрешённый путь обычного
файла при true или каталога при false.
На Windows канонический путь может иметь форму `\\?\GLOBALROOT\Device\...`,
когда AppContainer запрещает запрос DOS-имени тома; он обозначает тот же объект
и пригоден для повторного открытия. Лексической подстановки вместо разрешения нет.
`install_file(from, to)` публикует обычный файл в той же файловой системе
с отказом при существующем назначении.
Драйвер сам убирает исходный временный файл, если он остался после публикации.

`fiber_open`, `fiber_step`, `fiber_cancel` и `fiber_close` обслуживают
`std/tasks.vela`. `fiber_step` возвращает относительную задержку или
`Ok(-1)` при завершении. Дескрипторы рабочих групп и задач закрываются
своими API. См. [контракт](contracts/ASYNC-CANCELLATION.md).
В 0.4 добавлены OS-примитивы `file_identity` и `write_stdout`; их контракты описаны
в [LANGUAGE.md](LANGUAGE.md). Исторический reader продолжает выбирать функции 0.2.

Добавление обычной функции: строка каталога, реализация `v_NAME` в runtime,
положительные и отрицательные тесты. Новый intrinsic требует семантики и lowering
в `selfhost/types.vela` / `selfhost/intrinsics.vela`. Здесь нет генерации реализации
функции по описанию: каталог определяет интерфейс, runtime — поведение.
0.8 добавляет `float_sqrt` и `float_to_fixed` с типизированными результатами.
Операции `ffi_retain` и `ffi_release` требуют `state`. Правила описаны в
[числах](contracts/NUMBERS.md) и [контракте корней FFI](contracts/FFI-ROOTS.md).
`read_stdin(limit: Int, line: Bool) -> ReadResult effects { io }` reads binary
stdin through LF (included) or exactly `limit` bytes. Its maximum is 4 MiB;
a partial read or a limit ends a protocol stream. See the
[stdin contract](contracts/LSP.md).
