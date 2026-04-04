const { LanguageClient, TransportKind } = require("vscode-languageclient/node");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const docsPanel = require("./docsPanel");

let client;

function findServer() {
  const configured = vscode.workspace.getConfiguration("caustic").get("serverPath");
  if (configured && fs.existsSync(configured)) return configured;

  const folders = vscode.workspace.workspaceFolders;
  if (folders) {
    const ws = folders[0].uri.fsPath;
    const local = path.join(ws, "caustic-lsp");
    if (fs.existsSync(local)) return local;
  }

  try {
    return execFileSync("which", ["caustic-lsp"], { encoding: "utf8" }).trim();
  } catch {}

  return null;
}

/**
 * Process hover contents: find our docs link marker and replace with trusted command URI
 */
function processHoverContents(contents) {
  const marker = "[Open Documentation](command:caustic.openDocs?";

  function processOne(item) {
    let text = "";
    if (typeof item === "string") {
      text = item;
    } else if (item && typeof item.value === "string") {
      text = item.value;
    } else {
      return item;
    }

    const idx = text.indexOf(marker);
    if (idx === -1) return item;

    // Extract args
    const argsStart = idx + marker.length;
    const argsEnd = text.indexOf(")", argsStart);
    if (argsEnd === -1) return item;

    const rawArgs = text.substring(argsStart, argsEnd);
    const cleanText = text.substring(0, idx).replace(/\n\n---\n$/, "");

    const md = new vscode.MarkdownString(cleanText, true);
    md.isTrusted = true;
    md.supportHtml = true;
    const encodedArgs = encodeURIComponent(JSON.stringify(rawArgs));
    md.appendMarkdown(`\n\n---\n[Open Documentation](command:caustic.openDocs?${encodedArgs})`);
    return md;
  }

  if (Array.isArray(contents)) {
    return contents.map(processOne);
  }
  return processOne(contents);
}

function activate(context) {
  const serverPath = findServer();
  if (!serverPath) {
    vscode.window.showErrorMessage(
      "caustic-lsp not found. Set caustic.serverPath or add to PATH."
    );
    return;
  }

  const serverOptions = {
    run: { command: serverPath, transport: TransportKind.stdio },
    debug: { command: serverPath, transport: TransportKind.stdio },
  };

  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "caustic" }],
    middleware: {
      provideHover: async (document, position, token, next) => {
        const result = await next(document, position, token);
        if (!result || !result.contents) return result;

        const processed = processHoverContents(result.contents);
        return new vscode.Hover(processed, result.range);
      },
    },
  };

  client = new LanguageClient(
    "caustic-lsp",
    "Caustic Language Server",
    serverOptions,
    clientOptions
  );
  client.start();
  docsPanel.setClient(client);

  // Register the "Open Documentation" command
  const openDocsCmd = vscode.commands.registerCommand("caustic.openDocs", async (args) => {
    let moduleName = "";
    let symbolName = "";

    if (typeof args === "string") {
      const parts = args.split(",");
      moduleName = parts[0] || "";
      symbolName = parts[1] || "";
    } else if (args && args.module) {
      moduleName = args.module;
      symbolName = args.symbol || "";
    }

    if (!moduleName) return;

    try {
      const result = await client.sendRequest("caustic/docs", {
        module: moduleName,
        symbol: symbolName,
      });
      if (result && result.markdown) {
        docsPanel.show(result.module || moduleName, symbolName, result.markdown);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load docs: ${err.message}`);
    }
  });

  context.subscriptions.push(client, openDocsCmd);
}

function deactivate() {
  if (client) return client.stop();
}

module.exports = { activate, deactivate };
