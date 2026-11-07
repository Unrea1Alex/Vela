# Приёмка и переход к абстракциям 0.10

Контракт этапа 0.10.1 и критерии приёмки дальнейших этапов. Исходный компилятор
на момент принятия контракта — 0.9.0. Факты проверок по этапам находятся в
[роадмапе](../ROADMAP.md) и приложенных машинных отчётах.

## Фазы и bootstrap

1. 0.10.2–0.10.4 реализуются на исходном подмножестве Vela 0.9: новые syntax
   records → checker → checked HIR → backend. `opaque` влияет на доступ,
   не на layout; методы дают прямой SymbolId; interface bounds — явные
   obligations, разрешённые до concrete backend. Никаких syntax nodes в C backend.
2. До переноса selfhost/tools на новые конструкции собрать bridge старым
   compiler, проверить focused suite и `vela-dev verify` (три поколения,
   обе fixed points, без skips). Только затем изменить authored selfhost и
   повторить verify. Bundle обновляет только `vela-dev bundle`, не ручная правка.
3. 0.10.5/0.10.6 добавляют checked callable/dynamic call kinds, typed environment/
   box и статические таблицы impl. Allocation/visit/root descriptors генерируются
   в C из **проверенных типов**. Runtime предоставляет heap/OS, не поиск методов,
   type checking, generic resolution или compiler algorithms.
4. ABI 2 root protocol сохраняется: новые payload используют существующие
   managed allocations, typed visitors и scoped roots; private-поля трассируются.
   При неизменных runtime layout/signatures отдельный ABI bump не требуется.
   Если реализация потребует их несовместимого изменения, до кода обновляются
   GC-RUNTIME-ABI и номер ABI с bridge для старого emitter; смешанный ABI обязан
   отвергаться при сборке, а не работать с неполными roots.
5. Промежуточный compiler не использует closures/dyn в собственных источниках,
   пока bridge не прошёл GC-stress и fixed points. Перед выпуском — C recovery,
   чистая native-поставка, отдельный MCP gate и новый агент. Python/Node не
   становятся зависимостями native build/verify. DLL ABI 1 остаётся прежним;
   новые значения не попадают в extern без отдельного ABI-контракта.

Для всех вариантов вызова receiver/callee, ранее вычисленные аргументы и
возвращаемое значение rooted через последующие safepoints. Таблицы/код имеют
process lifetime; environments/boxes собираются по достижимости. Ни одна
оболочка не содержит адрес stack frame. Нет автоматического ownership transfer
или close при GC. Borrowed String в extern живёт лишь до конца синхронного
вызова; наличие callable/root не разрешает C сохранить его адрес.

## Диагностики до C backend

Коды E232–E239 **зарезервированы этим планом**, но ещё не выдаются compiler 0.9.
Для новых конструкций сначала проверяются имена/видимость, затем состав impl,
сигнатуры/effects, затем тела; within-stage порядок — исходный порядок деклараций.
Независимые ошибки не должны превращаться в C diagnostics. Границы source spans
и формат diagnostic JSON остаются действующими, error exit — 1.

| Код | Условие и основное место | Обязательные и условные details / related |
|---|---|---|
| E223 | Чужое закрытое поле/метод, токен доступа | owner/member; related объявление |
| E224 | Private-тип в публичном API, тип в сигнатуре | type; related private declaration |
| E232 | Внешнее конструирование opaque, имя конструктора | owner; related opaque declaration |
| E233 | Недопустимый owner/self/impl/конфликт метода, декларация | reason, owner; method только для ошибки конкретного метода; related конфликт при наличии |
| E234 | Нет impl/interface-bound или операция недоступна символическому типу, вызов | reason, actual_type, operation; interface для interface-вызова, type_parameter для символического типа; related bound при наличии |
| E235 | Чужая или повторная interface impl, заголовок impl | interface, implementor, reason; related владелец/первая impl |
| E236 | Пропущенный/лишний метод, тип или effects не соответствуют, impl/метод | interface, reason; method для ошибки метода, expected/actual для сравнения сигнатур; related interface signature при наличии |
| E237 | Недопустимая dyn упаковка/сигнатура/конверсия, dyn или выражение | interface, reason; related нарушение при наличии |
| E238 | Неверный/неявный capture или unsupported callable form, имя/форма | reason; capture только для ошибки захвата; related declaration при наличии |
| E239 | Неверный kind/невыводимый effect-аргумент, параметр/вызов | effect_parameter, reason; related declaration |
| E209 | Вызов/передача требует лишние эффекты | required_effects, allowed_effects, missing_effects; related signature |

Здесь details — новые аддитивные поля по мере реализации, не изменение текущих
сообщений 0.9. Неприменимые условные поля **отсутствуют**, а не содержат null или
пустую строку. Для E234 actual_type — отображение concrete-типа либо имени
символического параметра; отсутствие impl у concrete-типа не создаёт фиктивный
type_parameter. У повторного пустого inherent impl E233 не содержит method,
а у E238 для запрещённого bound-method value отсутствует capture.
Reason — стабильный машинный идентификатор условия из матрицы
ниже (например `opaque_constructor`, `impl_owner`, `impl_duplicate`,
`impl_missing_method`, `impl_effects`, `capture_missing`, `effect_not_inferred`).
Человекочитаемые сообщения называют операцию и причину; тесты фиксируют код,
reason и spans, а не путь к checkout. Для отсутствующего метода основной span —
заголовок impl, related — требуемая сигнатура. Для type/effect mismatch span —
реализующий метод. Видимость интерфейса/типа проверяется прежде наличия impl.

E201/E203/E204/E206/E210/E213/E217 сохраняют прежние назначения (тип, имя,
layout, неизвестный effect, generic/arity, immutable assignment, предел).
Неверный payload FFI всё ещё E228; foreign execution после close — прежний
located runtime panic 70, повторный close — WriteResult::Err, не новый
compile-time proof жизнеспособности. Случай E237 не заменяет E228 для extern.

## Матрица наблюдаемых сценариев

Идентификаторы стабильны; файлы реализации должны содержать соответствующие
ID в cases/test names. `+` означает будущий успешный сценарий, `−` — отказ.
Таблица задаёт независимое ожидание, а не вывод проверяемого compiler.

| ID / этап | Сценарий | Ожидание |
|---|---|---|
| A02-01 / 0.10.2 | + Opaque хранит private enum, фабрика возвращает public value | Клиент печатает `7`; скрытый layout не утекает |
| A02-02 / 0.10.2 | − Внешний constructor, включая пустой тип | E232 `opaque_constructor`, старый output не затронут |
| A02-03 / 0.10.2 | − Чтение/запись скрытого поля через import/generic | E223; владелец в related |
| A02-04 / 0.10.2 | − Private-тип в публичном результате/открытом поле | E224; opaque поле того же типа разрешено |
| A02-05 / 0.10.2 | + Копия скалярных полей и общего List | Изменение copy даёт исходный scalar `1`, общий элемент `9` |
| A02-06 / 0.10.2 | + Изменение hidden layout без правки клиента | Relock+rebuild; прежние stdout/результат; цикл layout — E204 |
| A03-01 / 0.10.3 | + Receiver и два аргумента пишут метки | `receiver,a,b,body` ровно по одному разу |
| A03-02 / 0.10.3 | + `?` во втором аргументе, cleanup | Тело/следующий аргумент не вызваны; cleanup один раз |
| A03-03 / 0.10.3 | + self-value, локальная копия и List alias | scalar вызывающего `1`, returned `2`, общий элемент `9` |
| A03-04 / 0.10.3 | − Чужой owner/self, поле/метод, повторный impl | E233, разные reason; private метод — E223 |
| A03-05 / 0.10.3 | + Generic owner, dot/qualified вызовы | Одинаковые значения, эффекты, target ID; receiver rooted при GC |
| A04-01 / 0.10.4 | + Две явные impl и один generic клиент | Одинаковый ответ `settings`; static call без box |
| A04-02 / 0.10.4 | − Structural совпадение без impl/нет bound | E234; concrete тип не выдаёт generic лишние операции |
| A04-03 / 0.10.4 | − Foreign-owner/duplicate/conditional impl | E235 `impl_owner`/`impl_duplicate`/`impl_conditional` |
| A04-04 / 0.10.4 | − Missing/extra/type/effect mismatch | E236 с соответствующим reason и related signature |
| A04-05 / 0.10.4 | + Smaller impl effects, общий ceiling | Общий caller сохраняет ceiling; недостаточные effects — E209 |
| A04-06 / 0.10.4 | − Ошибка unused bounded body/транзитивного generic | Отказ до C; legacy unbounded остаётся deferred |
| A04-07 / 0.10.4 | + SourceLens, bounded/deferred/concrete generic и builtin/extern | analysis_status различает тела/шаблоны/инстанции; у целей без Vela body отсутствует; unknown не считается pure |
| A04-08 / 0.10.4 | − Private interface-bound в публичной функции/типе | E224 у bound, related private interface declaration |
| A05-01 / 0.10.5 | + Callable effect widening/union inference | `{}` → `{io}` разрешено; обратное E209; E={io,state} для двух аргументов |
| A05-02 / 0.10.5 | − Effect только в результате, implicit capture | E239 `effect_not_inferred`; E238 `capture_missing` |
| A05-03 / 0.10.5 | + Capture var по значению, общий List | scalar после внешней записи остаётся `1`, общий элемент становится `9` |
| A05-04 / 0.10.5 | + Escaping closure и reentrant вызов | Живой capture переживает stack frame; независимые local roots |
| A05-05 / 0.10.5 | + Цикл List → closure → List | Живой цикл сохранён; недостижимый освобождён при принудительном GC |
| A05-06 / 0.10.5 | + RouteAudit/SourceLens error mapper и `?` | Сохранены typed cause, JSON path/line, ранний выход и cleanup |
| A06-01 / 0.10.6 | + Static и dyn варианты клиента | Одинаковые ответы/ошибки/эффекты и порядок аргументов |
| A06-02 / 0.10.6 | + Copy wrapper, scalar self, shared List | Один box у копий; scalar copy не меняет payload; List общий |
| A06-03 / 0.10.6 | − Неявный box, Self в результате, generic-method | E237 для dyn conversion; неподдержанная interface signature — E236 |
| A06-04 / 0.10.6 | + Payload → List → dyn cycle | Живые private-поля трассируются; недостижимый цикл собран |
| A06-05 / 0.10.6 | − Callable/dyn/opaque через extern ABI 1 | E228 до C; нет автоматического cast |
| AX-01 / 0.10.5–6 | + Close через alias при захвате/упаковке | Одна native destructor call; повторный close Err; use-after-close panic 70 до DLL |
| AX-02 / 0.10.5–6 | + Close failure/retain/release, достижимые wrapper | Ошибка сохраняет live resource/registration; release не закрывает |
| AX-03 / 0.10.3–6 | − Effect laundering через метод/interface/callable/FFI | E209/E236; pure contract не принимает state/io |
| AX-04 / 0.10.2–6 | + fmt/CLI/LSP/MCP/rename с Unicode и stale revision | Те же bindings/байты поведения; stale отвергнут; чужие корни не редактируются |
| AX-05 / 0.10.7 | + Clock/entropy fake, seeded PRNG, OS service | Управляемые ответы; fake не выполняет OS I/O; PRNG не требует io |
| AX-06 / 0.10.9–11 | Callback/root/cancel и GUI reentrancy | Отдельные контракты до кода; этот план не разрешает callbacks/async сейчас |

## Ресурсные бюджеты и будущий gate

До реализации зафиксированы следующие критерии: static method/interface dispatch
не создаёт managed box/environment; именованная функция и empty closure — 0
environment allocations; nonempty closure — 1 environment, dyn упаковка — 1 box.
Копирование wrapper и вызов сами по себе не выделяют такие объекты (тело может).
Замеры счётчиков отделяют эти объекты от неизменяемых строк/коллекций приложения.

После явного полного GC в изолированной fixture с освобождёнными корнями
не остаётся её недостижимых environments/boxes; после 10 и 100 одинаковых циклов
живые объекты/managed bytes совпадают при одинаковом live set. Общий process RSS
может удерживать страницы allocator, поэтому это не обещание нулевого RSS.
Vtable/code не размножаются по числу вызовов. Приёмка использует наблюдаемый
счётчик/диагностику сборщика, а не только отсутствие crash.

Для времени и размера заранее принимаются начальные regression-бюджеты,
а не обещания производительности произвольной программы. Парная fixture имеет
одну и ту же операцию, один заранее созданный receiver и 1 000 000 вызовов с
используемой контрольной суммой; измеряются 7 запусков после одного прогрева.
Одинаковые MSVC/options, без GC stress; median dynamic elapsed должен быть не
больше `10 * median static elapsed + 50 ms`. C и executable динамического
варианта — каждый не больше `4 * static bytes + 262144`; median чистой сборки —
не больше `4 * static build time + 5 s` (по 3 сборки). Эти консервативные границы
предназначены для обнаружения грубых регрессий первой реализации. Выход за них
требует анализа и явного изменения бюджета в roadmap **до** закрытия этапа;
измеренный провал нельзя задним числом объявить успешным. Корректность,
число allocations и освобождение памяти проверяются независимо от времени.

В 0.10.1 проверяются непротиворечивость контрактов, coverage матрицы, ссылки,
коды диагностики, неизменность compiler/runtime/catalog и сохранение порядка
roadmap. Новые syntax-фрагменты **не** добавляются в runnable examples и не
выдаются за прошедшие runtime-тесты. Full verify/GC/GUI/MCP/new-agent остаются
обязательствами перечисленных implementation-этапов и gate версии 0.10.
