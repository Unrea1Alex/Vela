# Приёмка Vela 0.7.0

Платформа: Windows x64 10.0.26300, MSVC 19.44.35222, Windows SDK 10.0.26100.0.
MCP: Node.js 24.17.0, официальный SDK 2.4.0, локальный stdio.
Итоговая самосборка и gate поставки пройдены; версия закрыта в [ROADMAP](ROADMAP.md).
Машиночитаемые [результаты](stage07-evidence.json) и [поставка](stage07-delivery-evidence.json).

| Этап | Выполненная проверка |
|---|---|
| 0.6.9 | Документация, skill, setup/doctor/launcher, executable idioms; отдельный холодный клиент |
| 0.7.1 | Float64, отказы типов и границы чисел; 905/905, locale с десятичной запятой |
| 0.7.2 | Восемь библиотечных модулей, JSON/config-report; 916/916, MCP 1000 запросов |
| 0.7.3 | Именованные тесты и schema 2; 939/939 и 11 focused checks |
| 0.7.4 | Контракт FFI ABI 1; compiler bootstrap и проверка ссылок |
| 0.7.5 | FFI, Int32, handles, DLL lock/staging; 33 focused, полный verify 974/974 |
| 0.7.6 | WinHTTP: 10 сценариев локального сервера; User32: окно, Unicode, кнопка 4 → 5, close, exit 0 |
| 0.7.7 | Контракт изоляции MCP и матрица отказов; compiler bootstrap |
| 0.7.8 | build/test/run, OS supervisor, immutable artifacts; SDK, OS, fault и cold-agent gates |

Логи этапов: build/stage07/069-* и 071-* … 078-*. После каждого этапа
компилятор собирался. Семантические изменения проходили полный native verify;
контрактные этапы 0.7.4/0.7.7 и интеграционный 0.7.6 — три поколения и обе fixed points.

Финальный native verify на 0.7.0: **974/974**, failed=0, skipped=0 в рабочем
дереве и повторно в чистой поставке с PATH без Node/Python. Три поколения компилятора,
байтовое совпадение C и fixed point bundler подтверждены в обоих прогонах.
Самостоятельный C recovery с /fp:strict тоже выдаёт тот же C байт-в-байт.
Логи: 078-verify.log, 078-clean-verify.log, 078-recovery.log.

MCP aggregate: **3/3 suites**, 1000 запросов, 25 отмен, wire/lifecycle/setup checks.
Execution: **24 SDK**, **26 OS**, **9 fault** проверок. Подготовка частного MSVC/SDK
из поставки проверена через Windows PowerShell 5.1; отдельный экземпляр MCP показал
восемь tools, собрал JSON-приложение, выполнил 3 теста и вернул точный stdout.
Нативное приложение из поставки также собрано, запущено и прошло 3 теста без Node/Python.
ZIP содержат delivery-manifest.json с SHA-256 каждого файла; итоги проверки распаковки
и хеши архивов находятся рядом с архивами в dist/stage07-archive-hashes.json.

MCP execution использует LPAC с единственной capability registryRead, Job Object,
частную копию MSVC/SDK и новые профили запросов. Zero-capability вариант отвергнут
по фактическому отказу CreateProcess. Необязательный vctip.exe исключён из копии:
его дочерние процессы исчерпывали process limit. Установленный VS/SDK и глобальные
ACL не менялись. Нет fallback к запуску программы с правами хоста.

Проверены реальные отказы чтения/записи внешнего sentinel, записи toolchain,
IPv4/IPv6 TCP и UDP sockets; работа private I/O и потомков внутри LPAC/Job;
лимиты памяти/процессов/вывода/дерева файлов; запрет breakaway; завершение потомков
при timeout, cancel, EOF и аварии supervisor. Последний сценарий также проверяет
восстановление ACL/profile. Принудительное завершение Node проверяет удаление
снимка и lease после остановки потомков. Disk limit контролируется опросом и допускает overshoot,
это не дисковая квота. В эксперименте Job accounting включал дополнительные
Windows console hosts; число всех OS processes не объявляется строго равным 8.

Проверены ошибки кода/тестов, unsaved overlays, изменённый/просроченный/поддельный
артефакт, изменённый toolchain, source race, hard links, path escape, argv, явное
разрешение DLL по SHA-256, двоичный stdout и отсутствие секретов host environment.
При неработающем backend остаются только пять analysis tools и причина отказа.

Новая сессия агента через реальные MCP tools разобрала JSON, исправила диагностику,
собрала приложение, выполнила три теста и получила
`count=3 total=10.5 mean=3.5`. [Отчёт](execution-onboarding-evidence.json).
Клиент запретил чтение SKILL.md с диска; агент сообщил об использовании автоматически
переданных инструкций. Установка и структура skill проверены отдельно. Успешное
чтение файла skill этим клиентом не заявляется.

Linux/macOS, remote MCP, удалённый TLS, async/callbacks, GC и полноценный переносимый
GUI не проверены и не входят в поддержку 0.7. GUI/network probes остаются ограниченными
прототипами. Нативные сборка/verify и обычные программы не зависят от Node.js/Python;
Node нужен только внешней MCP-интеграции и необязательному HTTP test server.

Историческая приёмка: [0.6](VALIDATION-0.6.md), [0.5](VALIDATION-0.5.md).
