import { Parser } from "htmlparser2";

// A thin layer over htmlparser2's streaming parser: an element stack with
// class lookups, and text captures that end when their element closes. SOC
// parsers are state machines on top of this, so a page is never held whole.

export interface Tag {
  name: string;
  attrs: Record<string, string>;
  /** Split `class` attribute. */
  classes: ReadonlySet<string>;
  depth: number;
}

export interface HtmlHandlers {
  open?(tag: Tag): void;
  close?(tag: Tag): void;
  /** Text outside any capture as well as inside; captures get it first. */
  text?(text: string): void;
}

export interface HtmlStream {
  write(chunk: string): void;
  end(): void;
  /** Starts capturing text; `done` gets it when the current element closes. */
  capture(done: (text: string) => void): void;
  /** Appends a marker to every open capture (e.g. around <strong> labels). */
  mark(marker: string): void;
  /** The currently open elements, outermost first. */
  readonly stack: readonly Tag[];
}

interface Capture {
  depth: number;
  parts: string[];
  done: (text: string) => void;
}

const EMPTY = new Set<string>();

export function createHtmlStream(handlers: HtmlHandlers): HtmlStream {
  const stack: Tag[] = [];
  const captures: Capture[] = [];

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const cls = attrs.class;
        const tag: Tag = {
          name,
          attrs,
          classes: cls ? new Set(cls.split(/\s+/).filter(Boolean)) : EMPTY,
          depth: stack.length,
        };
        stack.push(tag);
        handlers.open?.(tag);
      },
      ontext(text) {
        for (const c of captures) c.parts.push(text);
        handlers.text?.(text);
      },
      onclosetag() {
        const tag = stack.pop();
        if (!tag) return;
        // Finish captures opened inside this element (innermost first).
        while (captures.length > 0) {
          const last = captures[captures.length - 1];
          if (!last || last.depth < tag.depth) break;
          captures.pop();
          last.done(last.parts.join(""));
        }
        handlers.close?.(tag);
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );

  return {
    stack,
    write: (chunk) => parser.write(chunk),
    end: () => parser.end(),
    capture(done) {
      const top = stack[stack.length - 1];
      captures.push({ depth: top ? top.depth : 0, parts: [], done });
    },
    mark(marker) {
      for (const c of captures) c.parts.push(marker);
    },
  };
}

/** Collapses runs of whitespace and trims. */
export function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Parses a whole string (for small pages and tests). */
export function parseHtml(html: string, stream: HtmlStream): void {
  stream.write(html);
  stream.end();
}
