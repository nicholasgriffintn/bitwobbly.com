import { Fragment, type ReactNode } from "react";

const INLINE_TOKEN_PATTERN =
  /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^[-*+]\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.*)$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const HORIZONTAL_RULE_PATTERN = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const CODE_FENCE_PATTERN = /^```([\w-]+)?\s*$/;

type AssistantMarkdownProps = {
  content: string;
  className?: string;
};

function toSafeHref(rawHref: string): string | null {
  if (rawHref.startsWith("/")) return rawHref;

  try {
    const url = new URL(rawHref);
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:"
    ) {
      return rawHref;
    }
  } catch {
    return null;
  }

  return null;
}

function renderInline(
  text: string,
  keyPrefix: string,
  depth = 0
): ReactNode[] {
  if (!text) return [];
  if (depth > 2) return [text];

  return text.split(INLINE_TOKEN_PATTERN).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={key} className="assistant-markdown-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("[") && part.endsWith(")")) {
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (!linkMatch) return part;
      const [, label, href] = linkMatch;
      const safeHref = toSafeHref(href.trim());
      if (!safeHref) return part;
      return (
        <a
          key={key}
          href={safeHref}
          target={safeHref.startsWith("/") ? undefined : "_blank"}
          rel={safeHref.startsWith("/") ? undefined : "noopener noreferrer"}
        >
          {label}
        </a>
      );
    }

    if (
      ((part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))) &&
      part.length >= 4
    ) {
      return (
        <strong key={key}>
          {renderInline(part.slice(2, -2), `${key}-strong`, depth + 1)}
        </strong>
      );
    }

    if (
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))) &&
      part.length >= 3
    ) {
      return (
        <em key={key}>
          {renderInline(part.slice(1, -1), `${key}-em`, depth + 1)}
        </em>
      );
    }

    return part;
  });
}

function renderInlineLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${index}`}>
      {renderInline(line, `${keyPrefix}-line-content-${index}`)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function isBlockLine(trimmedLine: string): boolean {
  return (
    CODE_FENCE_PATTERN.test(trimmedLine) ||
    HEADING_PATTERN.test(trimmedLine) ||
    UNORDERED_ITEM_PATTERN.test(trimmedLine) ||
    ORDERED_ITEM_PATTERN.test(trimmedLine) ||
    BLOCKQUOTE_PATTERN.test(trimmedLine) ||
    HORIZONTAL_RULE_PATTERN.test(trimmedLine)
  );
}

function renderMarkdownBlocks(content: string): ReactNode[] {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    const codeFenceMatch = trimmedLine.match(CODE_FENCE_PATTERN);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1];
      index += 1;

      const codeLines: string[] = [];
      while (index < lines.length && !CODE_FENCE_PATTERN.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <pre key={`code-${blocks.length}`} className="assistant-markdown-pre">
          <code className={language ? `language-${language}` : undefined}>
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    const headingMatch = trimmedLine.match(HEADING_PATTERN);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      const headingText = headingMatch[2];
      const HeadingTag =
        level === 1
          ? "h1"
          : level === 2
            ? "h2"
            : level === 3
              ? "h3"
              : level === 4
                ? "h4"
                : level === 5
                  ? "h5"
                  : "h6";

      blocks.push(
        <HeadingTag
          key={`heading-${blocks.length}`}
          className={`assistant-markdown-h${level}`}
        >
          {renderInline(headingText, `heading-${blocks.length}`)}
        </HeadingTag>
      );
      index += 1;
      continue;
    }

    if (UNORDERED_ITEM_PATTERN.test(trimmedLine)) {
      const items: string[] = [];
      while (index < lines.length) {
        const nextLine = lines[index].trim();
        const itemMatch = nextLine.match(UNORDERED_ITEM_PATTERN);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`} className="assistant-markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`ul-${blocks.length}-item-${itemIndex}`}>
              {renderInline(item, `ul-${blocks.length}-item-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (ORDERED_ITEM_PATTERN.test(trimmedLine)) {
      const items: string[] = [];
      while (index < lines.length) {
        const nextLine = lines[index].trim();
        const itemMatch = nextLine.match(ORDERED_ITEM_PATTERN);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${blocks.length}`} className="assistant-markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`ol-${blocks.length}-item-${itemIndex}`}>
              {renderInline(item, `ol-${blocks.length}-item-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(trimmedLine)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteMatch = lines[index].trim().match(BLOCKQUOTE_PATTERN);
        if (!quoteMatch) break;
        quoteLines.push(quoteMatch[1]);
        index += 1;
      }

      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="assistant-markdown-blockquote"
        >
          {renderInlineLines(quoteLines, `quote-${blocks.length}`)}
        </blockquote>
      );
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(trimmedLine)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="assistant-markdown-hr" />);
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmedLine = nextLine.trim();
      if (!nextTrimmedLine) break;
      if (isBlockLine(nextTrimmedLine) && paragraphLines.length > 0) break;
      paragraphLines.push(nextLine);
      index += 1;
    }

    if (paragraphLines.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="assistant-markdown-paragraph">
          {renderInlineLines(paragraphLines, `p-${blocks.length}`)}
        </p>
      );
      continue;
    }

    index += 1;
  }

  return blocks;
}

export function AssistantMarkdown({
  content,
  className = "",
}: AssistantMarkdownProps) {
  if (!content.trim()) return null;

  return (
    <div className={`assistant-markdown ${className}`.trim()}>
      {renderMarkdownBlocks(content)}
    </div>
  );
}
