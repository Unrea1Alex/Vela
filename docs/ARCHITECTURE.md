# Архитектура Vela: типизированный компилятор 0.9

## Компилятор

`selfhost/` содержит активную реализацию на Vela:

~~~text
UTF-8 + source spans + modules.vela: source graph
  -> lexer.vela: tokens
  -> parser.vela: AST
  -> modules.vela: bound declarations (syntax remains immutable)
  -> types.vela + generics.vela + semantic.vela: resolved types, signatures, effects, checked HIR
  -> emitter.vela + intrinsics.vela: standalone C11
  -> driver.vela: C toolchain invocation, atomic publication
~~~

Каждый модуль разбирается отдельно: незакрытый синтаксис не может захватить
следующий файл. SourceUnit сохраняет путь, файловую идентичность и границы;
диагностика и runtime используют координаты исходного файла. Bound declarations
отделены от AST; backend получает разрешённые символы, а не import или syntax nodes.
Контракт: [MODULES](contracts/MODULES.md).

При `--cache` сборщик графа может повторно использовать список импортов
проверенного модуля. Драйвер проверяет разрешённый граф и безопасность
выходного пути перед повторным использованием успешной проверки или C.
Границы AST и checked HIR остаются прежними. [Контракт кэша](contracts/INCREMENTAL-BUILD.md).

В 0.11.0-dev.2 семантика различает синхронные и приостанавливаемые
callable. Проверка графа разрешённых вызовов работает по checked IR.
C backend получает проверенный await и вставляет переход в цикл и
лексическую уборку при отмене. Нативная подсистема хранит стеки и
дескрипторы ОС, а очередь задач и дедлайны реализованы на Vela.
[Контракт](contracts/ASYNC-CANCELLATION.md).

Начиная с 0.10.3 связывание проверяет владельца и получателя inherent-метода.
Семантика разрешает метод по номинальному типу и добавляет проверенного получателя
первым аргументом обычного checked call. C backend получает выбранный SymbolId,
не разрешает имена методов и применяет обычные правила порядка и GC roots.

В 0.10.4 связывание строит таблицу интерфейсов и реализаций. Отдельный проход
проверяет тела с interface-bound на символических типах, включая транзитивные
generic-вызовы. Его временные записи удаляются до конкретной специализации.
В checked call для генерации кода сохраняется выбранная реализация. Ссылка на
объявление интерфейсной операции нужна для навигации и анализа её эффектов.

В 0.7.1 lexer/parser различают Int и Float64 литералы; checker проверяет диапазон
через числовой runtime-примитив и сохраняет отдельный тип/kind HIR. Backend
эмитирует только проверенный десятичный литерал и double-операции с отключённым
fast-math/FP contraction. Размер binary64 проверяется в runtime при компиляции C.
Numeric conversion primitive не разбирает программу Vela. Миграция bootstrap
сначала вводит runtime/catalog, затем использование нового probe в checker.

В 0.7.3 parser сохраняет метку test в SyntaxFunction и создаёт недоступное из
пользовательского синтаксиса имя. Связывание/проверка тела проходят обычные фазы.
Runner выбирает уже проверенный SymbolId; generate_entry получает checked ID,
не текст декларации. Каждый тест имеет собственную нативную точку входа и процесс.
symbols выдаёт тесты отдельно от функций; test report schema 2 различает сбой,
тайм-аут, ошибку сборки и сохранённые артефакты.

`fmt` использует lexer/parser, сохранённые комментарии и конкретные написания
токенов; formatter не требует semantic analysis. Результат повторно разбирается
и сравнивается с последовательностью токенов/комментариев до вывода или записи.

Семантический анализ отмечает ссылки на разрешённые символы и их точные
исходные позиции. `query.vela` строит индекс и проверяет временные правки
повторным анализом, не обращаясь к C backend. `tools/lsp.vela` хранит версии
буферов и запускает тот же нативный query/plan worker. MCP вызывает эти команды
на изолированном снимке. См. [контракт](contracts/SEMANTIC-QUERIES.md).

AST и HIR — разные записи. Проверка имён, типов, полей, generic-параметров,
эффектов и полноты match завершается до вызова backend. Backend не принимает AST
и не использует C-компилятор для проверки языка.

В 1.0.1e checker разрешает `==`/`!=` для одного номинального enum без полей
во всех вариантах. Checked binary HIR сохраняет Bool-результат и проверенные
операнды. Backend вычисляет их слева направо во временные значения и сравнивает
теги, без чтения payload или memcmp; ABI и модель памяти не меняются.
[Контракт](contracts/ENUM-EQUALITY.md).

Generic-типы кэшируются до разрешения полей; конкретные функции ставятся в очередь
до проверки тел, что поддерживает взаимную рекурсию без смешивания областей имён.
Каждый экземпляр получает отдельные параметры, локальные символы и HIR. Очередь
завершается до сортировки зависимостей layout и генерации C. Шаблоны в backend
не поступают; внутренние C-имена экземпляров используют TypeId/SymbolId и не
содержат текст угловых скобок. Лимиты описаны в [GENERICS](contracts/GENERICS.md).

`errors.vela` проверяет распространение Option/Result; backend использует общий
путь возврата и постусловий для return и `?`. Match-выражения хранят проверенные
ветви и их единый тип. `control.vela` проверяет циклы и области выхода; переходы
backend адресуют ближайший цикл даже внутри C switch. Runtime snapshot — только
копирование типизированного хранилища, без разбора языка.

Интерполяция сохраняется отдельным конкретным токеном. Parser разбирает выражения
внутри него с исходными spans и общими AST-таблицами, checker проверяет форматы,
backend получает только String-части и проверенные scalar-преобразования. Сборка
строки использует private StringList; публичного state-эффекта для неё нет.

Context содержит отдельные List<T> таблицы синтаксиса, проверенных выражений и
инструкций, типов и символов. AstExprId/AstStmtId, ExprId/StmtId и TypeId/SymbolId
номинальны; таблицы отклоняют невалидные ссылки. Parser/checker/backend используют
именованные поля записей, без числовой раскладки. Checker не переписывает
пользовательский AST; перед анализом добавляются синтетические generic-шаблоны
prelude из каталога Option/Result.
[Контракт и карта миграции](contracts/AST-HIR-ID.md), [таблицы](../selfhost/README.md).

## Типы и понижение

Структуры и enum имеют номинальную идентичность и копируются по значению.
Объявления сначала регистрируются, затем разрешаются поля, затем определяется
порядок C-определений. Циклы по значению запрещены. Ссылочные коллекции разрывают
цикл: `struct Node { children: List<Node> }` имеет конечный размер.

`type Id = distinct Int;` создаёт новый тип, не alias. Разрешены основы Int,
Bool и String. Конструктор и поле `value` — явные границы преобразования.

`List<T>` и `Dict<K,V>` канонизируются по имени и аргументам. Сигнатуры builtin
содержат шаблоны типов; проверка объединяет явные и выведенные параметры, затем
создаёт конкретную HIR-сигнатуру. Пользовательские generic-функции проходят
отдельную очередь инстанцирования в generics.vela.

C-runtime хранит байтовые элементы известного размера, а проверенный backend
подставляет sizeof конкретного C-типа и копирует значения через временные
переменные. Vela не получает указатель в буфер коллекции. Словари используют
хеширование ключей и открытое адресование; разрешены скалярные ключи и distinct
обёртки. Проверка равенства ключей сравнивает содержимое строк, включая NUL.

Все выражения вычисляются слева направо; именованные поля конструктора —
в порядке записи аргументов, а не объявления полей. Короткое замыкание логических
операторов сохранено. Арифметика Int остаётся проверяемой.

Именованные функции и замыкания имеют один внутренний C calling convention с
первым аргументом для окружения. Прямой вызов передаёт null. Проверенный косвенный
вызов восстанавливает C-сигнатуру из типа callable и передаёт захваченное
окружение. Для непустого захвата backend выводит собственный тип payload и
GC visitor из проверенных типов полей. У runtime сохраняется ABI 2.

Для динамических интерфейсов checker записывает конкретные методы в HIR
упаковки и ссылку на интерфейсную операцию в HIR вызова. Backend выводит одну
таблицу на пару типов и создаёт адаптеры, которые передают копию получателя
методу. Упаковка использует точный GC visitor исходного типа, в том числе
для opaque-полей. Динамический вызов обращается к известной позиции таблицы.

## Общий каталог

`vela/builtins.def` задаёт prelude-enum, имена функций, параметры типов,
аргументы, результаты, эффекты, классификацию ABI и версию появления.
Нативный сборщик встраивает файл без генерации алгоритмов. `types.vela` читает
каталог, а `intrinsics.vela` выбирает по ABI способ понижения. Исторический
Python frontend читает тот же файл для своего подмножества 0.2.

Добавление обычной runtime-функции с поддерживаемым ABI требует одной строки
каталога и реализации в runtime. Новый вид intrinsic требует дополнительно
семантики и понижения; каталог не подменяет реализацию операции.

## Инструменты и тесты

`tools/bundle.vela` читает `selfhost/sources.list`, соединяет авторские модули и
добавляет строковые ресурсы каталога и runtime. Результат записывается атомарно.

`tools/dev.vela` управляет тремя поколениями, сравнением C, пересборкой инструментов,
сравнением исходников от двух поколений сборщика и публикацией после проверок.
`tools/test.vela` читает явный корпус `tests/cases/` и выполняет проверки CLI/ОС.
Он использует структуры, List и Dict самого языка.

C-runtime реализует арифметику, память, коллекции, файлы и процессы. Он не содержит
лексера, парсера, проверки типов, генерации Vela/C или вызовов Python.
FFI declarations resolve to checked Symbol signatures with original C symbol and
DLL basename. Semantic analysis rejects unsupported types/effects; no foreign body
enters CheckedFunction. Backend consumes only that checked signature, evaluates
arguments left-to-right and emits a typed C function-pointer call. Runtime owns
loader/handle metadata, ABI probe, borrowed bytes and fenv restoration, not parsing
or signature inference. Native companions are staged by the Vela project driver.
Запуск процессов передаёт список аргументов без shell. Для тестов добавлены
раздельный вывод в файлы и тайм-аут; на Windows дочернее дерево ограничено job object.

Python остаётся необязательным frontend 0.2 и дополнительной исторической
проверкой. Обычный цикл 0.3 не требует Python, pip или Python-пакетов.
## Managed heap lowering

The 0.8 C backend derives trace visitors from checked type and layout records.
It registers typed root slots for parameters, temporaries, locals and iteration
snapshots, and restores the root chain on every structured exit. Native runtime
code traces storage using those visitors. It never resolves Vela types or reads
syntax or HIR. See [memory](MEMORY.md) and [runtime ABI](contracts/GC-RUNTIME-ABI.md).

Task groups (1.0.1a) compose checked async callables and host-operation closures
in Vela's standard library. The checker still rejects blocking async call graphs;
enqueueing a closure does not execute it. Host ticks invoke I/O after yielding,
and task outcomes remain pending while owned children drain. This introduces no
new backend syntax or runtime ownership scheme. See [task groups](contracts/TASK-GROUPS.md).

Cache observability (1.0.1b) is confined to the driver, source graph and cache
storage layer. JSON Lines on stderr describe reuse/publication, never influence
type checking, and never mix with generated C or command JSON on stdout.

The GUI layer (1.0.1c) keeps form configuration, event queue ownership and the
public Window API in Vela. One ABI 1 adapter owns Win32 objects, Unicode
conversion, message delivery and DPI layout. It does not run application policy.
All three GUI examples share this boundary; see [GUI contract](contracts/GUI-LIBRARY.md).
