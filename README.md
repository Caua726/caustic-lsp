# caustic-lsp

**VS Code language support for [Caustic](https://github.com/Caua726/Caustic) — the `.cst` extension.**

![version](https://img.shields.io/badge/version-0.1.1-blue)
![vscode](https://img.shields.io/badge/VS%20Code-%5E1.75-007ACC)
![license](https://img.shields.io/badge/license-MIT-blue)

Syntax highlighting, diagnostics, hover, go-to-definition, completion,
references, rename, and a documentation viewer for Caustic source.

The language server itself is not here — it ships with the toolchain as
`caustic-lsp`, written in Caustic like everything else. This repository is the
editor half: the extension that starts that server and the TextMate grammar that
colours a file before the server has said anything.

## Features

| | |
|---|---|
| **Syntax highlighting** | the full grammar — types, `with` qualifiers, atomics, target builtins, `use`/`fn`/`struct`/`enum`, inline `asm`, `syscall` |
| **Diagnostics** | compiler errors and warnings, in the editor, at the right span |
| **Hover** | types and signatures |
| **Go to definition** | across modules, following `use` |
| **Completion** | module members after `mod.`, and the standard library |
| **References and rename** | across the project |
| **Documentation viewer** | the language and stdlib reference in a panel, without leaving the editor |

## Installing

Requires the [Caustic toolchain](https://github.com/Caua726/Caustic) — the
extension launches the `caustic-lsp` binary that ships with it, looking first in
the workspace root and then on `PATH`. If it lives somewhere else, point
`caustic.serverPath` at it.

From a packaged build:

```sh
code --install-extension caustic-lsp-0.1.1.vsix
```

To build the `.vsix` yourself:

```sh
npm install -g @vscode/vsce
vsce package
```

## Layout

```
extension.js                    activation, server launch, client wiring
docsPanel.js                    the documentation webview
syntaxes/caustic.tmLanguage.json  the TextMate grammar
language-configuration.json     brackets, comments, auto-closing pairs
```

## License

MIT — see [LICENSE](LICENSE).
