# Config report — Vela 0.7 library acceptance application

From the repository root:

```powershell
.\vela.cmd build apps/config-report/main.vela -o build/config-report.exe
.\build\config-report.exe --increment apps/config-report/sample.json build/config-output.json
Get-Content build/config-output.json
```

Expected report: `name=Vela 😀 count=4 enabled=true scale=1.25`.
Input is a JSON object with exactly name (string), count (nonnegative Int),
enabled (Bool), scale (positive finite Float64, decimal/exponent spelling).
The flag increments count with an explicit overflow error. Inputs are limited
to 1 MiB; invalid UTF-8/JSON, duplicate/unknown fields and wrong types fail with
exit 2 before publishing output. OUTPUT may equal INPUT: publication uses a
private sibling temporary file and atomic rename. It does not prevent concurrent
lost updates, promise metadata preservation or power-loss durability.

This exercises the Vela modules cli/config/json/text/path/fs. No Python or Node
is needed. Files are modified only by the explicit OUTPUT argument.
