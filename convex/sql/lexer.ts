import { Token } from "./types";

const KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "ORDER",
  "BY",
  "LIMIT",
  "AND",
  "OR",
  "ASC",
  "DESC",
  "AS",
]);

export class Lexer {
  private input: string;
  private position: number = 0;
  private tokens: Token[] = [];

  constructor(input: string) {
    this.input = input.trim();
  }

  tokenize(): Token[] {
    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      const char = this.input[this.position];

      if (char === "*") {
        this.tokens.push({ type: "STAR", value: "*", position: this.position });
        this.position++;
      } else if (char === ",") {
        this.tokens.push({ type: "COMMA", value: ",", position: this.position });
        this.position++;
      } else if (char === "=") {
        this.tokens.push({ type: "OPERATOR", value: "=", position: this.position });
        this.position++;
      } else if (char === "!" && this.peek() === "=") {
        this.tokens.push({ type: "OPERATOR", value: "!=", position: this.position });
        this.position += 2;
      } else if (char === ">") {
        if (this.peek() === "=") {
          this.tokens.push({ type: "OPERATOR", value: ">=", position: this.position });
          this.position += 2;
        } else {
          this.tokens.push({ type: "OPERATOR", value: ">", position: this.position });
          this.position++;
        }
      } else if (char === "<") {
        if (this.peek() === "=") {
          this.tokens.push({ type: "OPERATOR", value: "<=", position: this.position });
          this.position += 2;
        } else {
          this.tokens.push({ type: "OPERATOR", value: "<", position: this.position });
          this.position++;
        }
      } else if (char === "'" || char === '"') {
        this.tokenizeString(char);
      } else if (this.isDigit(char)) {
        this.tokenizeNumber();
      } else if (this.isAlpha(char)) {
        this.tokenizeIdentifierOrKeyword();
      } else {
        throw new Error(`Unexpected character '${char}' at position ${this.position}`);
      }
    }

    this.tokens.push({ type: "EOF", value: "", position: this.position });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position])) {
      this.position++;
    }
  }

  private peek(offset: number = 1): string {
    return this.input[this.position + offset] || "";
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  private tokenizeString(quote: string): void {
    const start = this.position;
    this.position++; // Skip opening quote
    let value = "";

    while (this.position < this.input.length && this.input[this.position] !== quote) {
      value += this.input[this.position];
      this.position++;
    }

    if (this.position >= this.input.length) {
      throw new Error(`Unterminated string at position ${start}`);
    }

    this.position++; // Skip closing quote
    this.tokens.push({ type: "STRING", value, position: start });
  }

  private tokenizeNumber(): void {
    const start = this.position;
    let value = "";

    while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
      value += this.input[this.position];
      this.position++;
    }

    if (this.input[this.position] === ".") {
      value += ".";
      this.position++;
      while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
        value += this.input[this.position];
        this.position++;
      }
    }

    this.tokens.push({ type: "NUMBER", value, position: start });
  }

  private tokenizeIdentifierOrKeyword(): void {
    const start = this.position;
    let value = "";

    while (this.position < this.input.length && this.isAlphaNumeric(this.input[this.position])) {
      value += this.input[this.position];
      this.position++;
    }

    const upperValue = value.toUpperCase();
    const type = KEYWORDS.has(upperValue) ? "KEYWORD" : "IDENTIFIER";

    this.tokens.push({ type, value: type === "KEYWORD" ? upperValue : value, position: start });
  }
}
