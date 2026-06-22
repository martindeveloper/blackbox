import type { ReactElement } from "react";

type ShellLang = "bash" | "powershell";

const PS_CMDLET = /^(?:Import|Export|Add|Get|Set|Remove|New|Select|ForEach)-[A-Za-z]+/;

function flushPlain(text: string, elements: ReactElement[], key: { n: number }) {
  if (text) {
    elements.push(<span key={key.n++}>{text}</span>);
  }
}

function highlightLine(line: string, lang: ShellLang, key: { n: number }): ReactElement[] {
  if (/^\s*#/.test(line)) {
    return [
      <span key={key.n++} className="tok-comment">
        {line}
      </span>,
    ];
  }

  const elements: ReactElement[] = [];
  let plain = "";
  let i = 0;

  const flush = () => {
    flushPlain(plain, elements, key);
    plain = "";
  };

  while (i < line.length) {
    const rest = line.slice(i);
    const quote = rest[0];

    if (quote === '"' || quote === "'") {
      flush();
      const end = line.indexOf(quote, i + 1);
      const token = end === -1 ? rest : line.slice(i, end + 1);
      elements.push(
        <span key={key.n++} className="tok-str">
          {token}
        </span>,
      );
      i += token.length;
      continue;
    }

    if (quote === "`") {
      flush();
      elements.push(
        <span key={key.n++} className="tok-punct">
          `
        </span>,
      );
      i++;
      continue;
    }

    const variable = rest.match(/^\$[\w]+/);
    if (variable) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-var">
          {variable[0]}
        </span>,
      );
      i += variable[0].length;
      continue;
    }

    const flag = rest.match(/^--?[\w][\w-]*/);
    if (flag) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-flag">
          {flag[0]}
        </span>,
      );
      i += flag[0].length;
      continue;
    }

    if (lang === "powershell") {
      const cmdlet = rest.match(PS_CMDLET);
      if (cmdlet) {
        flush();
        elements.push(
          <span key={key.n++} className="tok-cmd">
            {cmdlet[0]}
          </span>,
        );
        i += cmdlet[0].length;
        continue;
      }

      const certPath = rest.match(/^Cert:\\[\w\\]+/);
      if (certPath) {
        flush();
        elements.push(
          <span key={key.n++} className="tok-str">
            {certPath[0]}
          </span>,
        );
        i += certPath[0].length;
        continue;
      }
    }

    if (lang === "bash") {
      const before = line.slice(0, i);
      const atLineStart = /^\s*$/.test(before);

      const assignment = atLineStart ? rest.match(/^[A-Z_][\w]*/) : null;
      if (assignment && line[i + assignment[0].length] === "=") {
        flush();
        elements.push(
          <span key={key.n++} className="tok-var">
            {assignment[0]}
          </span>,
        );
        i += assignment[0].length;
        continue;
      }

      const command = atLineStart ? rest.match(/^[a-z][\w-]*/i) : null;
      if (command && line[i + command[0].length] !== "=") {
        flush();
        elements.push(
          <span key={key.n++} className="tok-cmd">
            {command[0]}
          </span>,
        );
        i += command[0].length;
        continue;
      }
    }

    const number = rest.match(/^\b\d+\b/);
    if (number) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-num">
          {number[0]}
        </span>,
      );
      i += number[0].length;
      continue;
    }

    if (/^[|()[\].\\]/.test(rest)) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-punct">
          {rest[0]}
        </span>,
      );
      i++;
      continue;
    }

    plain += line[i];
    i++;
  }

  flush();
  return elements;
}

export function highlightShell(code: string, lang: ShellLang): ReactElement[] {
  const lines = code.split("\n");
  const key = { n: 0 };
  const elements: ReactElement[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    elements.push(...highlightLine(lines[lineIndex] ?? "", lang, key));
    if (lineIndex < lines.length - 1) {
      elements.push(<span key={key.n++}>{"\n"}</span>);
    }
  }

  return elements;
}
