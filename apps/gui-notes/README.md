# Vela Notes

Текущий GUI использует общий [модуль](../../std/gui.vela) из 1.0.0-dev.3
с Unicode, прокруткой и DPI. Отдельной Win32-обвязки у приложения больше нет.

Редактор заметок для Windows x64. Модель хранится в Vela, окно и обычные
элементы управления предоставляет Win32. Приложение принимает текст до
4096 байт UTF-8 и сохраняет его атомарно.

Из корня Vela с MSVC:

```powershell
.\vela.cmd run apps/gui-notes/build.vela
.\build\gui-notes\notes.exe --demo
.\build\gui-notes\notes.exe my-note.txt
.\vela.cmd test apps/gui-notes/tests.vela --json
```

В `--demo` заметка живёт в памяти, и кнопка Save обновляет тот же
тестовый сервис. Для проверки повторного открытия добавьте `--cycles 3`
и закройте каждое окно по очереди. Рядом с `notes.exe` должна находиться
`vela-gui.dll`.
В нативной поставке 1.0 готовая пара находится в `apps/gui-notes/bin/`.

[Контракт приложения](../../docs/contracts/GUI-APPLICATION.md) описывает
обработку событий и порядок освобождения ресурсов.
## 0.11.1 lifecycle probe

The [async lifecycle probe](async_demo.vela) opens the same native window.
A child process and a typed task wait independently while the window
continues to handle input. Close shuts down both loops, confirms the
child Job drained, runs the task's defer once and releases the callback
before closing the window.

After building the Notes adapter, run these commands from the repository root.

```powershell
.\vela.cmd build tests/stdlib/child.vela -o build/gui-notes/async-child.exe
.\vela.cmd build apps/gui-notes/async_demo.vela -o build/gui-notes/async-notes.exe
.\build\gui-notes\async-notes.exe G:/Vela/build/gui-notes/async-child.exe G:/Vela/build/gui-notes
```

Enter text, click Save to acknowledge the input and then click Close.
The probe reports `Window closed after task cleanup and Job drain`.
