/**
 * label-parser.ts
 *
 * Parser for standardized geospatial Label datasets (CSV format) supporting:
 * 1. Target syntax: ADM0[::ADM1][::ADM2]
 * 2. Union expressions:
 *    - '|'  : Dissolved union (geometric merge without interior boundaries)
 *    - '||' : Logical grouped union (multi-member entity preserving boundaries)
 *    - '( ... )' : Parenthesized nested expressions, e.g. (A|B)||(C|D)
 * 3. Label content syntax:
 *    - ![alt](link) : Image icon (project-relative or internet URL)
 *    - "texts" or 'texts' : Plain text string
 *    - ![alt](link) "texts" : Composite badge
 * 4. Dataset metadata headers:
 *    - // @id: flags
 *    - // @nameZh: 國旗
 *    - // @nameEn: National Flag
 *    - // @shortBadge: 🏳️ 國旗
 *    - // @imageSize: 1.0 (or iconSize)
 */

export type TargetAstNode =
  | { type: "single"; target: string }
  | { type: "dissolve"; children: TargetAstNode[] }
  | { type: "group"; children: TargetAstNode[] };

export interface ParsedLabelDef {
  type: "image" | "text" | "badge";
  imageUrl?: string;
  text?: string;
  alt?: string;
}

export interface LabelDatasetMetadata {
  id: string;
  nameZh: string;
  nameEn: string;
  shortBadge: string;
  imageSize?: number;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  [key: string]: any;
}

export interface ParsedLabelItem {
  id: string;
  rawTarget: string;
  targetAst: TargetAstNode;
  atomicTargets: string[];
  labelDef: ParsedLabelDef;
  extraProps?: Record<string, string>;
}

export interface ParsedLabelDataset {
  metadata: LabelDatasetMetadata;
  items: ParsedLabelItem[];
}

// -------------------------------------------------------------
// 1. Target Grammar Tokenizer & Recursive Descent Parser
// -------------------------------------------------------------

const TOKEN_LPAREN = "LPAREN";
const TOKEN_RPAREN = "RPAREN";
const TOKEN_SINGLE_PIPE = "SINGLE_PIPE";
const TOKEN_DOUBLE_PIPE = "DOUBLE_PIPE";
const TOKEN_IDENT = "IDENT";

interface Token {
  type: string;
  value: string;
}

export function tokenizeTargetExpression(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: TOKEN_LPAREN, value: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: TOKEN_RPAREN, value: ")" });
      i++;
      continue;
    }

    if (ch === "|") {
      if (i + 1 < n && input[i + 1] === "|") {
        tokens.push({ type: TOKEN_DOUBLE_PIPE, value: "||" });
        i += 2;
      } else {
        tokens.push({ type: TOKEN_SINGLE_PIPE, value: "|" });
        i += 1;
      }
      continue;
    }

    // Accumulate IDENT until special delimiter ( | ( ) \n \r
    let ident = "";
    while (i < n) {
      const c = input[i];
      if (c === "(" || c === ")" || c === "|" || c === "\n" || c === "\r") {
        break;
      }
      ident += c;
      i++;
    }

    const trimmed = ident.trim();
    if (trimmed.length > 0) {
      tokens.push({ type: TOKEN_IDENT, value: trimmed });
    }
  }

  return tokens;
}

/**
 * Parses a target expression into an AST supporting:
 * - A|B (dissolve)
 * - A||B (logical group)
 * - (A|B)||(C|D) (nested expressions)
 */
export function parseTargetExpression(input: string): TargetAstNode {
  const tokens = tokenizeTargetExpression(input);
  if (tokens.length === 0) {
    throw new Error(`Empty target expression: "${input}"`);
  }

  let pos = 0;

  function peek(): Token | null {
    return tokens[pos] || null;
  }

  function consume(expectedType?: string): Token {
    const token = tokens[pos];
    if (!token || (expectedType && token.type !== expectedType)) {
      throw new Error(
        `Unexpected token at position ${pos}: expected ${expectedType || "token"}, found "${
          token ? token.value : "EOF"
        }" in "${input}"`
      );
    }
    pos++;
    return token;
  }

  // Expression := GroupExpr
  function parseExpression(): TargetAstNode {
    return parseGroupExpr();
  }

  // GroupExpr := DissolveExpr ( '||' DissolveExpr )*
  function parseGroupExpr(): TargetAstNode {
    const left = parseDissolveExpr();
    const children: TargetAstNode[] = [left];

    while (pos < tokens.length && peek()?.type === TOKEN_DOUBLE_PIPE) {
      consume(TOKEN_DOUBLE_PIPE);
      children.push(parseDissolveExpr());
    }

    if (children.length === 1) return left;
    return { type: "group", children };
  }

  // DissolveExpr := PrimaryExpr ( '|' PrimaryExpr )*
  function parseDissolveExpr(): TargetAstNode {
    const left = parsePrimaryExpr();
    const children: TargetAstNode[] = [left];

    while (pos < tokens.length && peek()?.type === TOKEN_SINGLE_PIPE) {
      consume(TOKEN_SINGLE_PIPE);
      children.push(parsePrimaryExpr());
    }

    if (children.length === 1) return left;
    return { type: "dissolve", children };
  }

  // PrimaryExpr := '(' Expression ')' | IDENT
  function parsePrimaryExpr(): TargetAstNode {
    const token = peek();
    if (!token) {
      throw new Error(
        `Unexpected end of expression while parsing target: "${input}"`
      );
    }

    if (token.type === TOKEN_LPAREN) {
      consume(TOKEN_LPAREN);
      const expr = parseExpression();
      consume(TOKEN_RPAREN);
      return expr;
    }

    if (token.type === TOKEN_IDENT) {
      consume(TOKEN_IDENT);
      return { type: "single", target: token.value };
    }

    throw new Error(`Unexpected token: "${token.value}" in "${input}"`);
  }

  const ast = parseExpression();
  if (pos < tokens.length) {
    throw new Error(
      `Trailing tokens after parsing target expression: "${tokens[pos].value}" in "${input}"`
    );
  }
  return ast;
}

/**
 * Extracts all atomic target strings (ADM0[::ADM1][::ADM2]) referenced in an AST.
 */
export function extractAtomicTargets(node: TargetAstNode): string[] {
  if (node.type === "single") {
    return [node.target];
  }
  const set = new Set<string>();
  for (const child of node.children) {
    for (const t of extractAtomicTargets(child)) {
      set.add(t);
    }
  }
  return Array.from(set);
}

// -------------------------------------------------------------
// 2. Label Content Column Parser
// -------------------------------------------------------------

/**
 * Parses the Label column content:
 * - ![alt](link) -> Image
 * - "text" / 'text' -> Text
 * - ![alt](link) "text" -> Badge
 * - Plain string fallback -> Text
 */
export function parseLabelContent(raw: string): ParsedLabelDef {
  const str = (raw || "").trim();

  // 1. Badge: ![alt](url) "text"
  const badgeMatch1 = str.match(/^!\[(.*?)\]\((.*?)\)\s+["'](.*?)["']$/);
  if (badgeMatch1) {
    return {
      type: "badge",
      imageUrl: badgeMatch1[2].trim(),
      text: badgeMatch1[3].trim(),
      alt: badgeMatch1[1].trim(),
    };
  }

  // Badge: "text" ![alt](url)
  const badgeMatch2 = str.match(/^["'](.*?)["']\s+!\[(.*?)\]\((.*?)\)$/);
  if (badgeMatch2) {
    return {
      type: "badge",
      imageUrl: badgeMatch2[3].trim(),
      text: badgeMatch2[1].trim(),
      alt: badgeMatch2[2].trim(),
    };
  }

  // 2. Image: ![alt](url)
  const imgMatch = str.match(/^!\[(.*?)\]\((.*?)\)$/);
  if (imgMatch) {
    return {
      type: "image",
      imageUrl: imgMatch[2].trim(),
      alt: imgMatch[1].trim(),
    };
  }

  // 3. Quoted text: "texts" or 'texts'
  const textMatch = str.match(/^["'](.*)["']$/);
  if (textMatch) {
    return {
      type: "text",
      text: textMatch[1].trim(),
    };
  }

  // 4. Fallback plain text
  return {
    type: "text",
    text: str,
  };
}

// -------------------------------------------------------------
// 3. CSV Dataset & Metadata Header Parser
// -------------------------------------------------------------

/**
 * Parses a complete CSV label file containing comment headers and Target/Label rows.
 */
export function parseLabelCsv(
  csvText: string,
  defaultId = "custom-labels"
): ParsedLabelDataset {
  const lines = csvText.split(/\r?\n/);
  const metadata: LabelDatasetMetadata = {
    id: defaultId,
    nameZh: "自訂標籤",
    nameEn: "Custom Labels",
    shortBadge: "🏷️ 標籤",
  };

  let headerIndex = -1;
  let headers: string[] = [];

  // 1. Parse top metadata headers (// @key: value)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("//")) {
      const match = line.match(/^\/\/\s*@([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1];
        const val = match[2].trim();
        if (key === "imageSize" || key === "iconSize") {
          metadata[key] = parseFloat(val) || 1.0;
        } else {
          metadata[key] = val;
        }
      }
      continue;
    }

    // Found table header row (e.g. Target,Label)
    if (headerIndex === -1) {
      headerIndex = i;
      headers = parseCsvRow(line).map((h) => h.trim().toLowerCase());
      break;
    }
  }

  if (headerIndex === -1) {
    return { metadata, items: [] };
  }

  const targetColIdx = headers.findIndex((h) => h === "target");
  const labelColIdx = headers.findIndex((h) => h === "label");

  if (targetColIdx === -1 || labelColIdx === -1) {
    console.warn(
      `[LabelParser] CSV missing required columns 'Target' and 'Label'. Headers found:`,
      headers
    );
  }

  const items: ParsedLabelItem[] = [];

  // 2. Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith("//")) continue;

    const row = parseCsvRow(rawLine);
    if (row.length === 0) continue;

    const rawTarget = (row[targetColIdx >= 0 ? targetColIdx : 0] || "").trim();
    const rawLabel = (row[labelColIdx >= 0 ? labelColIdx : 1] || "").trim();

    if (!rawTarget) continue;

    try {
      const targetAst = parseTargetExpression(rawTarget);
      const atomicTargets = extractAtomicTargets(targetAst);
      const labelDef = parseLabelContent(rawLabel);

      const extraProps: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        if (c !== targetColIdx && c !== labelColIdx && row[c]) {
          extraProps[headers[c]] = row[c].trim();
        }
      }

      items.push({
        id: `label-item-${metadata.id}-${items.length + 1}`,
        rawTarget,
        targetAst,
        atomicTargets,
        labelDef,
        extraProps: Object.keys(extraProps).length > 0 ? extraProps : undefined,
      });
    } catch (err) {
      console.warn(
        `[LabelParser] Failed to parse row ${i + 1} ("${rawLine}"):`,
        err
      );
    }
  }

  return { metadata, items };
}

/**
 * Standard CSV row parser handling quotes and commas.
 */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Asynchronously loads and parses a CSV label dataset from a URL or static asset path.
 */
export async function loadLabelDatasetFromUrl(
  url: string
): Promise<ParsedLabelDataset> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch label dataset from ${url}: ${res.statusText}`);
  }
  const text = await res.text();
  const idFromUrl = url.split("/").pop()?.replace(/\.csv$/i, "") || "dataset";
  return parseLabelCsv(text, idFromUrl);
}
