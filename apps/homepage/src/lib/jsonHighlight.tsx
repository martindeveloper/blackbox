import type { ReactElement } from "react";

export function highlightJson(code: string): ReactElement[] {
  const elements: ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < code.length) {
    if (code[i] === '"') {
      const end = code.indexOf('"', i + 1);
      if (end === -1) break;
      const token = code.slice(i, end + 1);
      const after = code.slice(end + 1).trimStart();
      if (after.startsWith(":")) {
        elements.push(
          <span key={key++} className="tok-key">
            {token}
          </span>,
        );
      } else {
        elements.push(
          <span key={key++} className="tok-str">
            {token}
          </span>,
        );
      }
      i = end + 1;
    } else if (code[i] === "[" || code[i] === "]" || code[i] === "{" || code[i] === "}") {
      elements.push(
        <span key={key++} className="tok-brace">
          {code[i]}
        </span>,
      );
      i++;
    } else if (/[0-9-]/.test(code[i] ?? "")) {
      let num = "";
      while (i < code.length && /[0-9.-]/.test(code[i] ?? "")) {
        num += code[i++];
      }
      elements.push(
        <span key={key++} className="tok-num">
          {num}
        </span>,
      );
    } else {
      let chunk = "";
      while (
        i < code.length &&
        code[i] !== '"' &&
        !/[[{}\]]/.test(code[i] ?? "") &&
        !/[0-9]/.test(code[i] ?? "")
      ) {
        chunk += code[i++];
      }
      if (chunk) {
        elements.push(
          <span key={key++} className="tok-punct">
            {chunk}
          </span>,
        );
      }
    }
  }

  return elements;
}
