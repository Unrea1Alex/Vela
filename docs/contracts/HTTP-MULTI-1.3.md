# Контракт транспорта HTTP на libcurl multi

Этап 1.3.2 проверяет контракт отдельным Windows x64 прототипом. API
`http::curl_multi`, интеграция `async_io` и миграция приложений относятся к 1.3.3.
Путь совместимости `http::curl` / `http::curl_transfer` сохраняет свои настройки.
Multi использует in-process adapter и возвращает ошибку зависимости при отсутствии
совместимого адаптера.

## Сборка и доверие

Кандидат использует libcurl 8.23.0, OpenSSL 3.5.9 и асинхронный DNS c-ares 1.34.8,
собранные MSVC x64 со статическим CRT в один adapter. Обычные консольные программы,
компилятор и его bootstrap не загружают и не собирают сетевой адаптер. Сборка
проверяет SHA-256 релизных исходников. В Windows-пакете приложений идут адаптер,
лицензии curl, c-ares и OpenSSL и manifest с версиями. Внешние системные
зависимости включают WinSock и Windows crypto/store. Linux возвращает Unsupported
до приобретения ресурсов.

Из корня проекта в PowerShell с окружением MSVC x64:

```powershell
.\scripts\build-http-multi-deps.ps1
cmake -S native/http-client -B build/stage13/transport-probe -G "Visual Studio 17 2022" -A x64 "-DCMAKE_PREFIX_PATH=$PWD/build/stage13/transport-deps/install" "-DOPENSSL_ROOT_DIR=$PWD/build/stage13/transport-deps/openssl-install"
cmake --build build/stage13/transport-probe --config Release --parallel 8
```

Скрипты сборки приложений берут DLL из каталога `Release` этого build.
Для другого каталога укажите полный путь к DLL в `VELA_HTTP_ADAPTER`.
После сборки приложения сохраняйте DLL рядом с EXE и распространяйте вместе
с ней `vela-http-dependencies.json` и три файла из `install/licenses`.

Разрешены HTTP и HTTPS, HTTP/1.1 и TLS от 1.2, проверка имени/цепочки включена. Явно выключены
redirect, proxy из окружения, netrc, автоматическая отправка credentials и cookie jar.
CA задаётся на весь owner: системное хранилище корней Windows или фиксированные
PEM байты. В custom-режиме проверка использует только этот PEM. При открытии
проверяется размер и снимается копия. Разбор сертификатов и offline-проверку
цепочки выполняет OpenSSL при TLS. Автоматическая сетевая загрузка CRL/AIA
выключена. Смена PEM требует нового owner.
TLS session/connection cache отдельный у каждого owner. Совместимость origin
проверяет libcurl с ключом схема/host/port и согласованной TLS конфигурацией.
Запрос с пользовательскими заголовками/credentials идёт по свежему соединению,
которое закрывается после запроса. Для него отключён TLS session cache. Так
разные credentials не используют сохранённое состояние соединения или сессии.
POST, PUT и DELETE начинают передачу на свежем соединении. Это сохраняет
отсутствие повторной отправки записи при сбое ранее использованного сокета.
GET и HEAD могут восстановиться через внутренний reconnect libcurl.
Настройки поддержки остаются видимыми при упаковке и обновлении.

## Владение и лимиты

Каждый Vela owner работает на одном host thread и владеет одним CURLM, очередью,
обработчиками и снимком политики CA. Aliases разделяют состояние. Новая работа
отклоняется после начала close. Каждый запрос владеет easy handle и данными до
терминального перехода. Native слой копирует URL, headers, upload и custom CA.
Callbacks libcurl пишут только в ограниченные native буферы. GC не закрывает
ресурсы, native callback не хранит Vela pointer и не вызывает Vela callback.

Vela policy задаёт max active 1..16, per-origin 1..max active, очередь 0..112 и
не более 128 одновременно выданных request slots, включая результаты до release.
Native multi дублирует физические лимиты `MAX_TOTAL_CONNECTIONS`, `MAX_HOST_CONNECTIONS`
и `MAXCONNECTS`, последнее не больше max active. Origin в очереди задаётся
нормализованной схемой, ASCII host и явным либо default port. Из ожидающих
запускается первый, чей origin имеет свободный слот. Head-of-line busy origin
не блокирует свободный origin. Новая запись при полной очереди даёт typed limit.
Callbacks ограничены 64 KiB сырых headers и заданным пределом body до 1 MiB
через публичный Request (ABI имеет собственный защитный потолок 16 MiB),
upload до 1 MiB, custom CA до 1 MiB. Суммарный допустимый объём зарезервированных
body buffers owner — 64 MiB. Превышение лимита прекращает запрос без частичного
успеха. Запросы со статусом 4xx/5xx остаются HTTP responses. Redirect возвращается
как 3xx. Adapter не добавляет прикладных повторов.

Idle time — максимальный возраст **для повторного использования** по
`CURLOPT_MAXAGE_CONN` (30 секунд по умолчанию). Старое соединение libcurl
выбрасывает при поиске кандидата. Если у всего owner нет live transfer и
очереди, очередной host tick после idle deadline очищает multi connection cache.
Между ticks приложение не обещает автономное закрытие сокетов. После close
кэш и все принадлежащие owner handles освобождены.

## Дедлайны, драйвер, исходы

Host clock монотонный, миллисекунды. Абсолютный deadline = enqueue time + total
timeout с проверкой диапазона. Дедлайн не пересчитывается при admission. В easy
передаётся остаток, а connect timeout — минимум отдельного connect budget и остатка.
При одинаковом бюджете соединения и запроса код тайм-аута относится к запросу.
При более коротком connect budget учитываются завершение TCP или TLS и
собственный elapsed libcurl. Это разделяет ошибку установления соединения и
общий дедлайн даже между соседними значениями системного tick.
Vela scope/loop выполняет bounded `curl_multi_perform` и извлекает terminal messages
без блокирующего ожидания. c-ares DNS продвигается драйвером. Busy ticks между
передачами планируются обычным wait, а не ожиданием socket на UI thread.
Консольный host может вызвать `http::multi_wait` между ticks. Это отдельная
синхронная операция с эффектом `process`, пределом 1–10 мс и ожиданием готовности
сокетов. Она не продвигает запросы и не запускает callbacks. Номинальный предел
ожидания зависит от планировщика ОС, абсолютный deadline продолжает проверяться
в следующем tick. GUI и приостанавливаемые задачи используют неблокирующие ticks.

Порядок каждого tick: уже зафиксированный terminal outcome сохраняется, затем
обрабатывается ранее принятая отмена, затем `now >= deadline`, затем completion
после `perform`. Если час после `perform` достиг deadline до фиксации completion,
исход timeout. Cancel/close линейны на host thread; отмена одного запроса не
трогает остальные. Повторные cancel/close идемпотентны и не меняют исход.
Завершение снимает easy с multi и освобождает callback data для ввода до
публикации исхода. Готовые body/header bytes принадлежат слоту до копирования
или release. Ошибка cleanup учитывается отдельно от причины операции.
Результат читается только после terminal, освобождение инвалидирует все aliases.
Native calls используют ABI 1 для владельцев и узкий байтовый ABI копирования
ограниченного результата в текущем вызове. Внешние указатели не выходят в Vela.

## Верификация

Прототип проверяет версию/TLS/DNS, независимый счётчик TCP/TLS на loopback,
повторное использование и изоляцию, лимиты, deadline/cancel/close, CA смену и
очистку native буферов. Стенд запускается отдельно от измерения дерева клиента.
Прототип не устанавливает поддержку языка или платформы. Допуск 50 мс для
deadline в стенде с шагом host не выше 2 мс фиксируется до замеров. В 1.3.3
полная матрица включает отдельные DNS/connect/TLS/upload/download фазы и
30-минутный soak. Обе стадии имеют свой native gate.

## Граница DLL в 1.3.3

Опциональный `vela-http.dll` загружается из каталога executable и проверяется
по `vela_ffi_abi_version=1` и отдельному `vela_http_adapter_version=1`.
Нативные примитивы используют отдельные owner tags для pool и request. Обычный
FFI не может удерживать, освобождать или регистрировать callbacks на этих owners.
Операции адаптера идут на текущем host thread, с сохранением среды Float64.
Общий `Transport.start` сохраняет прежние эффекты `io,state`. Специфичный
вход multi загружает только этот фиксированный адаптер, а общие extern остаются
под прежним `process` эффектом. Отсутствующая DLL или символ возвращают typed
ошибку factory до создания pool.

Входные `VelaBytes` заимствуются лишь на вызов, затем native данные принадлежат
request или pool. Результат view — указатель/длина из native storage, пригодные
до следующего вызова к этому request. Примитив сразу проверяет верхний предел
канала и копирует в управляемую Vela String. Адаптер не выдаёт указатель в Vela.
Каналы 0/1/2 означают raw headers, raw body и краткую native причину ошибки.
Операции 0/1 означают tick/close pool, 2/3 — cancel/release request, 4/5/6 —
исход, HTTP status и libcurl code. Аварийный shutdown вызывается только runtime
перед выгрузкой DLL (операция 7). Операции 8–17 ожидают готовность сокета с
бюджетом 1–10 мс. Слоты request снимаются с roots при release. Обычный close
pool требует освобождения слотов, после чего снимает root самого pool.

Schannel был первым кандидатом. TLS-стенд вернул code 60 `the revocation status
is unknown` на локальной цепочке. В исходниках этой сборки проверка revocation
вызывает синхронный `CertGetCertificateChain` внутри multi tick. Для сохранения
неблокирующего host tick выбран OpenSSL с явной offline-политикой проверки цепочки.
Размер этой зависимости входит в бюджет поставки 1.3.6.

Источники реализации: [сборка curl](https://curl.se/docs/install.html),
[curl 8.23.0](https://github.com/curl/curl/releases/tag/curl-8_23_0),
[OpenSSL 3.5.9](https://github.com/openssl/openssl/releases/tag/openssl-3.5.9),
[c-ares 1.34.8](https://github.com/c-ares/c-ares/releases/tag/v1.34.8),
[CAINFO_BLOB](https://curl.se/libcurl/c/CURLOPT_CAINFO_BLOB.html),
[MAXAGE_CONN](https://curl.se/libcurl/c/CURLOPT_MAXAGE_CONN.html),
[multi limits](https://curl.se/libcurl/c/multi_setopt_options.html),
[connect timeout](https://curl.se/libcurl/c/CURLOPT_CONNECTTIMEOUT_MS.html),
[TCP connection time](https://curl.se/libcurl/c/CURLINFO_CONNECT_TIME_T.html),
[TLS handshake time](https://curl.se/libcurl/c/CURLINFO_APPCONNECT_TIME_T.html),
[terminal messages](https://curl.se/libcurl/c/curl_multi_info_read.html).
