import type { ReactElement } from "react";

function flushPlain(text: string, elements: ReactElement[], key: { n: number }) {
  if (text) {
    elements.push(<span key={key.n++}>{text}</span>);
  }
}

function highlightLine(line: string, key: { n: number }): ReactElement[] {
  const elements: ReactElement[] = [];
  let plain = "";
  let i = 0;

  const flush = () => {
    flushPlain(plain, elements, key);
    plain = "";
  };

  const commentIndex = line.indexOf("#");
  const body = commentIndex === -1 ? line : line.slice(0, commentIndex);
  const comment = commentIndex === -1 ? "" : line.slice(commentIndex);

  while (i < body.length) {
    const rest = body.slice(i);
    const quote = rest[0];

    if (quote === '"' || quote === "'") {
      flush();
      const end = body.indexOf(quote, i + 1);
      const token = end === -1 ? rest : body.slice(i, end + 1);
      elements.push(
        <span key={key.n++} className="tok-str">
          {token}
        </span>,
      );
      i += token.length;
      continue;
    }

    const keyMatch = rest.match(/^[\w][\w.-]*(?=\s*:)/);
    if (keyMatch) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-key">
          {keyMatch[0]}
        </span>,
      );
      i += keyMatch[0].length;
      continue;
    }

    const bool = rest.match(/^(?:true|false|null)\b/);
    if (bool) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-flag">
          {bool[0]}
        </span>,
      );
      i += bool[0].length;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?/);
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

    if (/^[:|>-]/.test(rest)) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-punct">
          {rest[0]}
        </span>,
      );
      i++;
      continue;
    }

    if (/^-\s/.test(rest)) {
      flush();
      elements.push(
        <span key={key.n++} className="tok-punct">
          -
        </span>,
      );
      i++;
      continue;
    }

    plain += body[i];
    i++;
  }

  flush();

  if (comment) {
    elements.push(
      <span key={key.n++} className="tok-comment">
        {comment}
      </span>,
    );
  }

  return elements;
}

export function highlightYaml(code: string): ReactElement[] {
  const lines = code.split("\n");
  const key = { n: 0 };
  const elements: ReactElement[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    elements.push(...highlightLine(lines[lineIndex] ?? "", key));
    if (lineIndex < lines.length - 1) {
      elements.push(<span key={key.n++}>{"\n"}</span>);
    }
  }

  return elements;
}
