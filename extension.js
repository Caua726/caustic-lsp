const { LanguageClient, TransportKind } = require("vscode-languageclient/node");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

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
  };

  client = new LanguageClient(
    "caustic-lsp",
    "Caustic Language Server",
    serverOptions,
    clientOptions
  );
  client.start();

  context.subscriptions.push(client);
}

function deactivate() {
  if (client) return client.stop();
}

module.exports = { activate, deactivate };
