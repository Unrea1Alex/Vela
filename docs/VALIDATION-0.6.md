# Приёмка Vela 0.6.0 — 4 ноября 2026

Среда: Windows x64, MSVC C11 /O2 /MT. Компилятор, bundler, dev и native test runner
написаны на Vela. Чистая нативная поставка проверена с PATH только Windows/System32
и Windows, без Python/Node. MCP проверяется отдельно: Node.js 24.17.0, SDK 2.4.0.

| Этап | Проверка |
|---|---|
| 0.6.1 | MODULES/RFC, базовый verify 688/688 |
| 0.6.2 | Модули и три поколения: 850/850; focused 164/164 |
| 0.6.3 | SHA-256: 855/855; manifest/lock: 878/878; focused 22/22 |
| 0.6.4 | Нативный CLI: 886/886; focused CLI 29/29 |
| 0.6.5 | NATIVE-RESOURCES; compiler build/check |
| 0.6.6 | MCP-PROTOCOL/skill/quickstart; compiler build, starter build/run/test |
| 0.6.7 | Compiler/SDK build; CLI equivalence, bounds, отмена, два протокола |
| 0.6.8 | Итоговый verify в рабочем и чистом дереве: 887/887 в каждом |

Все успешные native verify включали три поколения compiler, C fixed point,
bundler fixed point, failed=0 и skipped=0. Compiler собирается из обычного
selfhost/vela.project. Автономный bundle сохранён. C recovery собран отдельно;
он порождает байт-в-байт тот же C компилятора. Последняя регрессия защищает
объявленную, но не импортированную зависимость от перезаписи output.

MCP: 1000 последовательных запросов после прогрева, 25 отмен с подтверждённым
запуском native child, ещё 6 отмен через протокол и отключения во время анализа.
Рост RSS ниже принятого предела 64 MiB; число дескрипторов не выросло.
Проверены схемы, CLI equivalence, Unicode/плохой UTF-8, raw JSON, limits,
links/junctions/hardlinks, aliases, неизменность исходников, snapshots,
несовместимые хеши и ошибки запуска. [Измерения](mcp-evidence.json),
[wire](mcp-wire-evidence.json). Временный compiler clone теперь удаляется до
возврата последнего активного запроса: завершение Codex между запросами не
оставляет его на диске. Принудительное убийство ОС посреди операции не является
гарантированным graceful shutdown; обычные EOF/cancel/SIGTERM проверены.

MCP Inspector 2.13.0: 14 вызовов и повторных подключений, tools/resources/check/
format/symbols; legacy 2025-11-25 и modern 2026-07-28. Строгая проверка схем
прошла без ошибок/предупреждений. [Отчёт](mcp-inspector-evidence.json).

Codex CLI 0.157.0, модель по умолчанию gpt-6-astra: пять отдельных сессий без
истории Vela. Каждая читает context/help и проверяет код через MCP. Коллекции,
Result, Unicode/файлы, manifest dependency и исправление ошибки: пять компиляций
и 13 независимых поведенческих проверок. Неизвестных API в финальном коде нет.
[Финальный отчёт](cold-start-evidence.json).

Первые пять попыток не завершили задачи: политика среды запрещала запись
файлов. [Первый отчёт](cold-start-initial-policy-evidence.json) сохранён.
Этот опыт привёл к text/overlay_path: агент проверяет несохранённый код, отдельный
стенд сохраняет, собирает и запускает возвращённый исходник. Ошибка подсчёта
текстовых событий стенда исправлена по сохранённым логам; код агента и ожидания
не менялись. Промежуточные успешные попытки и повторная проверка после исправления
очистки также сохраняются; неудачные прогоны не удаляются из истории.

Поставка разделена: vela-0.6.0-windows-x64.zip и vela-mcp-0.6.0.zip. MCP —
npm ci --omit=dev; compatibility.json фиксирует хеши compiler/runtime/catalog/docs.
Логи: build/stage06. [Сводная приёмка](stage06-evidence.json).

Linux smoke начат, но Ubuntu WSL не стартует из-за отсутствующих ext4.vhdx.
Linux/macOS не объявлены поддержанными. Public FFI/native resource linking и
MCP build/test/run относятся к последующим этапам.
Предыдущая приёмка: [Vela 0.5](VALIDATION-0.5.md).
