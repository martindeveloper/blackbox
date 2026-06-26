import type { ReactElement } from "react";

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "while",
]);

const DECLARATION_KEYWORDS = new Set([
  "class",
  "const",
  "enum",
  "function",
  "interface",
  "let",
  "type",
  "var",
]);
const CONTROL_KEYWORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "continue",
  "default",
  "do",
  "else",
  "finally",
  "for",
  "if",
  "return",
  "switch",
  "throw",
  "try",
  "while",
]);
const MODULE_KEYWORDS = new Set(["export", "from", "import"]);
const LITERALS = new Set(["false", "null", "true", "undefined"]);
const BUILTINS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Math",
  "Number",
  "Object",
  "Promise",
  "React",
  "RegExp",
  "Set",
  "String",
  "console",
  "document",
  "globalThis",
  "window",
]);
const TYPE_WORDS = new Set([
  "Array",
  "Boolean",
  "Error",
  "Map",
  "Number",
  "Promise",
  "ReactNode",
  "Record",
  "Set",
  "String",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "unknown",
  "void",
]);

function classForKeyword(token: string): string {
  if (CONTROL_KEYWORDS.has(token)) {
    return "tok-key tok-key--control";
  }

  if (MODULE_KEYWORDS.has(token)) {
    return "tok-key tok-key--module";
  }

  if (DECLARATION_KEYWORDS.has(token)) {
    return "tok-key tok-key--decl";
  }

  return "tok-key";
}

function pushToken(elements: ReactElement[], key: { n: number }, text: string, className?: string) {
  if (!text) {
    return;
  }

  elements.push(
    className ? (
      <span key={key.n++} className={className}>
        {text}
      </span>
    ) : (
      <span key={key.n++}>{text}</span>
    ),
  );
}

function readQuoted(code: string, start: number, quote: '"' | "'" | "`"): number {
  let i = start + 1;

  while (i < code.length) {
    const char = code[i] ?? "";

    if (char === "\\") {
      i += 2;
      continue;
    }

    if (char === quote) {
      return i + 1;
    }

    i++;
  }

  return code.length;
}

function isIdentifierStart(char: string | undefined): boolean {
  return !!char && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return !!char && /[\w$]/.test(char);
}

function isTypePosition(code: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && /\s/.test(code[i] ?? "")) {
    i--;
  }

  return code[i] === ":" || code[i] === "<" || code[i] === "|" || code[i] === "&";
}

function previousNonSpace(code: string, start: number): string {
  let i = start - 1;
  while (i >= 0 && /\s/.test(code[i] ?? "")) {
    i--;
  }

  return code[i] ?? "";
}

function nextNonSpace(code: string, start: number): string {
  let i = start;
  while (i < code.length && /\s/.test(code[i] ?? "")) {
    i++;
  }

  return code[i] ?? "";
}

function isFunctionCall(code: string, end: number): boolean {
  return nextNonSpace(code, end) === "(";
}

function isAllCapsConstant(token: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(token);
}

function jsxTagNameClass(name: string): string {
  return /^[A-Z]/.test(name) ? "tok-type" : "tok-tag";
}

export function highlightJs(code: string): ReactElement[] {
  const elements: ReactElement[] = [];
  const key = { n: 0 };
  let i = 0;
  let inJsxTag = false;
  let jsxExpressionDepth = 0;

  while (i < code.length) {
    const rest = code.slice(i);
    const char = code[i] ?? "";

    if (rest.startsWith("//")) {
      const end = code.indexOf("\n", i);
      const token = end === -1 ? rest : code.slice(i, end);
      pushToken(elements, key, token, "tok-comment");
      i += token.length;
      continue;
    }

    if (rest.startsWith("/*")) {
      const end = code.indexOf("*/", i + 2);
      const token = end === -1 ? rest : code.slice(i, end + 2);
      pushToken(elements, key, token, "tok-comment");
      i += token.length;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = readQuoted(code, i, char);
      pushToken(elements, key, code.slice(i, end), "tok-str");
      i = end;
      continue;
    }

    if (char === "`") {
      const end = readQuoted(code, i, char);
      pushToken(elements, key, code.slice(i, end), "tok-template");
      i = end;
      continue;
    }

    const decorator = rest.match(/^@[A-Za-z_$][\w$]*/);
    if (decorator) {
      pushToken(elements, key, decorator[0], "tok-decorator");
      i += decorator[0].length;
      continue;
    }

    const jsxTag = rest.match(/^<\/?([A-Za-z][\w.-]*)/);
    if (jsxTag && (jsxTag[0].startsWith("<") || jsxTag[0].startsWith("</"))) {
      const prefix = jsxTag[0].startsWith("</") ? "</" : "<";
      const name = jsxTag[1] ?? "";
      pushToken(elements, key, prefix, "tok-punct");
      pushToken(elements, key, name, jsxTagNameClass(name));
      i += prefix.length + name.length;
      inJsxTag = true;
      continue;
    }

    if (isIdentifierStart(char)) {
      const tokenStart = i;
      let token = char;
      i++;
      while (i < code.length && isIdentifierPart(code[i])) {
        token += code[i] ?? "";
        i++;
      }

      if (KEYWORDS.has(token)) {
        pushToken(elements, key, token, classForKeyword(token));
      } else if (LITERALS.has(token)) {
        pushToken(elements, key, token, "tok-flag");
      } else if (inJsxTag && jsxExpressionDepth === 0) {
        pushToken(elements, key, token, "tok-attr");
      } else if (previousNonSpace(code, tokenStart) === ".") {
        pushToken(elements, key, token, isFunctionCall(code, i) ? "tok-method" : "tok-prop");
      } else if (isFunctionCall(code, i)) {
        pushToken(elements, key, token, "tok-fn");
      } else if (BUILTINS.has(token)) {
        pushToken(elements, key, token, "tok-builtin");
      } else if (isAllCapsConstant(token)) {
        pushToken(elements, key, token, "tok-const");
      } else if (TYPE_WORDS.has(token) || isTypePosition(code, i - token.length)) {
        pushToken(elements, key, token, "tok-type");
      } else {
        pushToken(elements, key, token);
      }
      continue;
    }

    const number = rest.match(/^\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i);
    if (number) {
      pushToken(elements, key, number[0], "tok-num");
      i += number[0].length;
      continue;
    }

    if (/^[{}[\]()]/.test(rest)) {
      if (inJsxTag && rest[0] === "{") {
        jsxExpressionDepth++;
      } else if (inJsxTag && rest[0] === "}") {
        jsxExpressionDepth = Math.max(0, jsxExpressionDepth - 1);
      }
      pushToken(elements, key, rest[0] ?? "", "tok-brace");
      i++;
      continue;
    }

    const operator = rest.match(
      /^(?:=>|\/>|===|!==|==|!=|<=|>=|\?\?|\|\||&&|\+\+|--|\+=|-=|\*=|\/=|%=|[<>/=+\-*%!|&])/,
    );
    if (operator) {
      const token = operator[0];
      pushToken(elements, key, token, "tok-op");
      if (token === ">" || token === "/>") {
        inJsxTag = false;
        jsxExpressionDepth = 0;
      }
      i += token.length;
      continue;
    }

    if (/^[.,;:?]/.test(rest)) {
      pushToken(elements, key, rest[0] ?? "", "tok-punct");
      i++;
      continue;
    }

    pushToken(elements, key, char ?? "");
    i++;
  }

  return elements;
}
