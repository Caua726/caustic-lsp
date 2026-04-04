const vscode = require("vscode");

let panel = null;
let clientRef = null;

function setClient(c) { clientRef = c; }

async function fetchModules() {
  if (!clientRef) return { language: [], stdlib: [], project: [] };
  try {
    return await clientRef.sendRequest("caustic/modules", {});
  } catch {
    return { language: [], stdlib: [], project: [] };
  }
}

async function show(module, symbol, markdown) {
  const modules = await fetchModules();

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "causticDocs",
      `Caustic Docs: ${module}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => { panel = null; });
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "navigate" && clientRef) {
        try {
          const result = await clientRef.sendRequest("caustic/docs", {
            module: msg.module,
            symbol: msg.symbol || "",
          });
          if (result && result.markdown) {
            show(result.module || msg.module, msg.symbol || "", result.markdown);
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to load docs: ${err.message}`);
        }
      }
    });
  }

  panel.title = `Caustic Docs: ${module}`;
  panel.webview.html = renderHtml(module, symbol, markdown, modules);
  panel.reveal(vscode.ViewColumn.One, false);
}

function renderHtml(module, symbol, markdown, modules) {
  // Extract TOC from ## headers
  const sections = [];
  const headerRe = /^## (.+)$/gm;
  let m;
  while ((m = headerRe.exec(markdown)) !== null) {
    const name = m[1].trim();
    if (name !== "_module") sections.push(name);
  }

  let html = markdown;

  // ## headers → h2 with id anchors
  html = html.replace(/^## (.+)$/gm, (match, name) => {
    const id = name.trim().replace(/[^a-zA-Z0-9_]/g, "_");
    const display = name.trim() === "_module" ? `${esc(module)} — Overview` : esc(name);
    return `</div><div class="section"><h2 id="${id}">${display}</h2>`;
  });

  // --- → section dividers (remove, sections handle it)
  html = html.replace(/^---$/gm, "");

  // Indented blocks → code
  const lines = html.split("\n");
  let result = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("  ") && !line.startsWith("</div>") && !line.startsWith("<div")) {
      if (!inCode) { result.push('<pre class="codeblock"><code>'); inCode = true; }
      result.push(esc(line.substring(2))); // strip 2-space indent
    } else {
      if (inCode) { result.push("</code></pre>"); inCode = false; }
      result.push(line);
    }
  }
  if (inCode) result.push("</code></pre>");
  html = result.join("\n");

  // Inline formatting
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");

  // Clean up empty divs from first section
  html = html.replace(/^<\/div>/, "");

  const scrollId = symbol ? symbol.replace(/[^a-zA-Z0-9_]/g, "_") : "";

  // Build sidebar sections
  const langList = (modules.language || []);
  const stdlibList = (modules.stdlib || []);
  const projectList = (modules.project || []);

  function makeLinks(items, type) {
    return items.map(name => {
      const isActive = (type === "lang" && module === "Language" && symbol === name) ||
                       (type !== "lang" && name === module);
      const cls = isActive ? ' class="active"' : '';
      const mod = type === "lang" ? "_lang" : name;
      const sym = type === "lang" ? name : "";
      return `<a href="#" data-module="${mod}" data-symbol="${sym}"${cls}>${esc(name)}</a>`;
    }).join("\n");
  }

  const langLinks = makeLinks(langList, "lang");
  const stdlibLinks = makeLinks(stdlibList, "stdlib");
  const projectLinks = projectList.length > 0
    ? makeLinks(projectList, "project")
    : '<span class="empty">none imported</span>';

  const tocLinks = sections.map(name => {
    const id = name.replace(/[^a-zA-Z0-9_]/g, "_");
    return `<a href="#" data-scroll="${id}" class="toc-item">${esc(name)}</a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-foreground, #cccccc);
    --fg-dim: var(--vscode-descriptionForeground, #888);
    --border: var(--vscode-panel-border, #333);
    --sidebar-bg: var(--vscode-sideBar-background, #181818);
    --hover-bg: var(--vscode-list-hoverBackground, #2a2d2e);
    --active-bg: var(--vscode-list-activeSelectionBackground, #094771);
    --accent: var(--vscode-symbolIcon-moduleForeground, #4ec9b0);
    --fn-color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
    --code-bg: var(--vscode-textCodeBlock-background, #1a1a1a);
    --highlight: var(--vscode-editor-findMatchHighlightBackground, #515c6a44);
    --font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    --mono: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', Consolas, monospace);
    --mono-size: var(--vscode-editor-font-size, 13px);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); color: var(--fg); background: var(--bg); display: flex; height: 100vh; overflow: hidden; }

  /* Sidebar */
  .sidebar {
    width: 240px; min-width: 240px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    overflow-y: auto; padding: 16px 0;
  }
  .sidebar::-webkit-scrollbar { width: 6px; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .sidebar .group { margin-bottom: 8px; }
  .sidebar .group-title {
    font-size: 0.7em; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--fg-dim); padding: 10px 20px 4px;
  }
  .sidebar a {
    display: block; padding: 4px 20px 4px 28px;
    color: var(--fg); text-decoration: none;
    font-size: 0.88em; line-height: 1.5;
    border-left: 2px solid transparent;
    cursor: pointer; transition: all 0.1s;
  }
  .sidebar a:hover { background: var(--hover-bg); }
  .sidebar a.active {
    color: var(--accent); font-weight: 500;
    border-left-color: var(--accent);
    background: var(--active-bg);
  }
  .sidebar .toc-item { padding-left: 36px; font-size: 0.82em; color: var(--fg-dim); }
  .sidebar .toc-item:hover { color: var(--fg); }
  .sidebar .empty { display: block; padding: 4px 20px 4px 28px; font-size: 0.82em; color: var(--fg-dim); font-style: italic; }
  .sidebar .divider { height: 1px; background: var(--border); margin: 8px 20px; }

  /* Content */
  .content {
    flex: 1; overflow-y: auto; padding: 32px 40px; max-width: 860px;
  }
  .content::-webkit-scrollbar { width: 8px; }
  .content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  h1 {
    font-size: 1.5em; font-weight: 600;
    color: var(--accent);
    padding-bottom: 12px; margin-bottom: 20px;
    border-bottom: 2px solid var(--border);
  }
  .section {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .section:last-child { border-bottom: none; }
  h2 {
    font-size: 1.15em; font-weight: 600;
    color: var(--fn-color);
    margin: 16px 0 8px;
    padding-top: 8px;
  }
  h2:first-child { margin-top: 0; }

  p { margin: 6px 0; line-height: 1.65; }

  code.inline {
    font-family: var(--mono); font-size: var(--mono-size);
    background: var(--code-bg); padding: 1px 5px;
    border-radius: 3px; border: 1px solid var(--border);
  }
  pre.codeblock {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 16px; margin: 10px 0;
    overflow-x: auto;
  }
  pre.codeblock code {
    font-family: var(--mono); font-size: var(--mono-size);
    line-height: 1.5; background: none; border: none; padding: 0;
  }
  strong { color: var(--fg); font-weight: 600; }

  .highlight {
    background: var(--highlight);
    border-radius: 4px; padding: 2px 0;
    transition: background 0.5s;
  }
</style>
</head>
<body>
  <div class="sidebar">
    <div class="group">
      <div class="group-title">Language</div>
      ${langLinks}
    </div>
    <div class="divider"></div>
    <div class="group">
      <div class="group-title">Standard Library</div>
      ${stdlibLinks}
    </div>
    <div class="divider"></div>
    <div class="group">
      <div class="group-title">Project</div>
      ${projectLinks}
    </div>
    <div class="divider"></div>
    <div class="group">
      <div class="group-title">On this page</div>
      ${tocLinks}
    </div>
  </div>
  <div class="content" id="content">
    <h1>${esc(module)}</h1>
    <div class="section">${html}</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll(".sidebar a[data-module]").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        vscode.postMessage({ command: "navigate", module: a.dataset.module, symbol: a.dataset.symbol || "" });
      });
    });

    document.querySelectorAll(".sidebar a[data-scroll]").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        const el = document.getElementById(a.dataset.scroll);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight");
          setTimeout(() => el.classList.remove("highlight"), 2000);
        }
      });
    });

    const scrollId = "${scrollId}";
    if (scrollId) {
      setTimeout(() => {
        const el = document.getElementById(scrollId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight");
          setTimeout(() => el.classList.remove("highlight"), 2000);
        }
      }, 150);
    }
  </script>
</body>
</html>`;
}

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { show, setClient };
