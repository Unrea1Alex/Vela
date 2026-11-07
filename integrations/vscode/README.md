# Vela Language for VS Code

Open a file ending in .vela and VS Code selects the Vela language mode.
The extension highlights Vela 0.8 syntax, including types, contracts, comments,
numbers, strings and expressions inside interpolated strings. It also adds
line comment toggling and bracket and quote pairing. It uses your editor theme
and needs neither a Vela compiler nor a language server.

## Install

In VS Code, choose **Extensions: Install from VSIX…** from the Command Palette,
or run:

~~~powershell
code --install-extension path/to/vela-language-0.1.0.vsix
~~~

Reload the window if it was already open. Open `examples/pipeline.vela`
from the Vela repository and check for **Vela** in the status bar.

## Build the VSIX from source

Run from the repository root in PowerShell. Node.js 22 or newer is needed only
for packaging:

~~~powershell
New-Item -ItemType Directory -Force dist | Out-Null
Push-Location integrations/vscode
try {
    npx --yes @vscode/vsce@4.1.0 package --no-dependencies --out ../../dist/vela-language-0.1.0.vsix
} finally {
    Pop-Location
}
code --install-extension dist/vela-language-0.1.0.vsix
~~~

The grammar is declarative and follows the [VS Code TextMate guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide).
When Vela syntax changes, update syntaxes/vela.tmLanguage.json and use
**Developer: Inspect Editor Tokens and Scopes** to check affected examples.
