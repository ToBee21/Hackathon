import type { AiDeepDiveInput } from "../../shared/aiDeepDive/types"

const DEBUGGER_PROTOCOL_VERSION = "1.3"
const MAX_EXTRACTED_TEXT_CHARS = 12_000

type Debuggee = { tabId: number }

interface DebuggerApi {
  attach: (
    target: Debuggee,
    requiredVersion: string,
    callback?: () => void
  ) => void
  sendCommand: (
    target: Debuggee,
    method: string,
    commandParams?: Record<string, unknown>,
    callback?: (result?: RuntimeEvaluateResponse) => void
  ) => void
  detach: (target: Debuggee, callback?: () => void) => void
}

interface RuntimeEvaluateResponse {
  result?: {
    value?: unknown
  }
  exceptionDetails?: unknown
}

interface ExtractedDebuggerText {
  title?: unknown
  meta?: unknown
  headings?: unknown
  body?: unknown
}

export function canUseDebuggerTextExtraction(tabUrl: string | undefined): boolean {
  if (!tabUrl) return false

  try {
    const protocol = new URL(tabUrl).protocol
    return ["chrome:", "edge:", "about:", "file:", "data:", "view-source:"].includes(
      protocol
    )
  } catch {
    return false
  }
}

export async function extractVisibleTextWithDebugger(
  tabId: number,
  tabUrl: string | undefined,
  debuggerApi: DebuggerApi | undefined = globalThis.chrome?.debugger
): Promise<AiDeepDiveInput | null> {
  if (!debuggerApi || !canUseDebuggerTextExtraction(tabUrl)) return null

  const target = { tabId }
  let attached = false

  try {
    await attachDebugger(debuggerApi, target)
    attached = true

    const response = await sendDebuggerCommand(debuggerApi, target, "Runtime.evaluate", {
      expression: DEBUGGER_EXTRACT_TEXT_EXPRESSION,
      returnByValue: true,
      awaitPromise: false,
      silent: true
    })

    if (response.exceptionDetails) return null

    const value = response.result?.value as ExtractedDebuggerText | undefined
    if (!value || typeof value !== "object") return null

    const body = boundedString(value.body)
    const title = boundedString(value.title)
    const meta = boundedString(value.meta)
    const headings = boundedString(value.headings)
    if (!body && !title && !meta && !headings) return null

    return {
      title,
      meta,
      headings,
      body,
      origin: originForTabUrl(tabUrl),
      path: pathForTabUrl(tabUrl)
    }
  } catch {
    return null
  } finally {
    if (attached) {
      await detachDebugger(debuggerApi, target).catch(() => undefined)
    }
  }
}

function attachDebugger(api: DebuggerApi, target: Debuggee): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      api.attach(target, DEBUGGER_PROTOCOL_VERSION, () => {
        const error = runtimeLastError()
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}

function sendDebuggerCommand(
  api: DebuggerApi,
  target: Debuggee,
  method: string,
  params: Record<string, unknown>
): Promise<RuntimeEvaluateResponse> {
  return new Promise((resolve, reject) => {
    try {
      api.sendCommand(target, method, params, (result) => {
        const error = runtimeLastError()
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve(result ?? {})
      })
    } catch (error) {
      reject(error)
    }
  })
}

function detachDebugger(api: DebuggerApi, target: Debuggee): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      api.detach(target, () => {
        const error = runtimeLastError()
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}

function runtimeLastError(): chrome.runtime.LastError | undefined {
  try {
    return globalThis.chrome?.runtime?.lastError
  } catch {
    return undefined
  }
}

function boundedString(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_EXTRACTED_TEXT_CHARS) : ""
}

function originForTabUrl(tabUrl: string | undefined): string {
  if (!tabUrl) return "unknown-origin"

  try {
    const parsed = new URL(tabUrl)
    if (parsed.origin !== "null") return parsed.origin
    if (parsed.protocol === "file:") return "file://local"
    if (parsed.protocol === "about:") {
      return `about://${parsed.hostname || parsed.pathname || "blank"}`
    }

    const host = parsed.hostname || parsed.pathname.split("/").find(Boolean)
    return host ? `${parsed.protocol}//${host}` : "unknown-origin"
  } catch {
    return "unknown-origin"
  }
}

function pathForTabUrl(tabUrl: string | undefined): string {
  if (!tabUrl) return "/"

  try {
    const parsed = new URL(tabUrl)
    if (parsed.protocol === "file:") return "file://local"
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return "/"
  }
}

const DEBUGGER_EXTRACT_TEXT_EXPRESSION = `(() => {
  const MAX = ${MAX_EXTRACTED_TEXT_CHARS};
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "INPUT", "TEXTAREA",
    "SELECT", "OPTION", "BUTTON", "SVG", "CANVAS", "VIDEO", "AUDIO"
  ]);

  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const chunks = [];
  let total = 0;

  const push = (value) => {
    const text = clean(value);
    if (!text || text.length < 2 || total >= MAX) return;
    chunks.push(text);
    total += text.length + 1;
  };

  const isHidden = (element) => {
    if (!element || SKIP_TAGS.has(element.tagName)) return true;
    if (element.closest && element.closest("[aria-hidden='true'], [hidden]")) return true;
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
  };

  const walkText = (root) => {
    if (!root || total >= MAX) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || isHidden(parent)) return NodeFilter.FILTER_REJECT;
        return clean(node.textContent).length >= 2
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    let node = walker.nextNode();
    while (node && total < MAX) {
      push(node.textContent);
      node = walker.nextNode();
    }

    if (!root.querySelectorAll) return;
    for (const element of root.querySelectorAll("*")) {
      if (total >= MAX) break;
      if (element.shadowRoot) walkText(element.shadowRoot);
    }
  };

  const headings = [];
  const collectHeadings = (root) => {
    if (!root || !root.querySelectorAll) return;
    for (const element of root.querySelectorAll("h1,h2,h3,[role='heading']")) {
      if (!isHidden(element)) headings.push(clean(element.textContent));
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) collectHeadings(element.shadowRoot);
    }
  };

  collectHeadings(document);
  walkText(document);

  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');

  return {
    title: clean(document.title).slice(0, 1000),
    meta: clean(meta && meta.content).slice(0, 2000),
    headings: headings.filter(Boolean).join("\\n").slice(0, 3000),
    body: chunks.join("\\n").slice(0, MAX)
  };
})()`
