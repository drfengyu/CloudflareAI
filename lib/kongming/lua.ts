/**
 * A compact Lua subset interpreter for the original Tstd2 quest scripts.
 * The scripts only use call/if/goto/local-for/for-in, so this intentionally
 * implements that subset instead of shipping a WASM Lua runtime.
 */

type TokenType = "name" | "number" | "string" | "op" | "eof";
interface Token {
  type: TokenType;
  value: string;
  line: number;
}
export type LuaExpr =
  | { t: "lit"; v: unknown }
  | { t: "name"; name: string }
  | { t: "table"; items: LuaExpr[] }
  | { t: "index"; obj: LuaExpr; key: LuaExpr }
  | { t: "member"; obj: LuaExpr; name: string }
  | { t: "call"; fn: LuaExpr; args: LuaExpr[] }
  | { t: "un"; op: string; v: LuaExpr }
  | { t: "bin"; op: string; l: LuaExpr; r: LuaExpr };
export type LuaStmt =
  | { t: "local"; name: string; value?: LuaExpr }
  | { t: "assign"; name: string; value: LuaExpr }
  | { t: "assignTarget"; target: LuaExpr; value: LuaExpr }
  | { t: "call"; value: LuaExpr }
  | { t: "if"; branches: { cond: LuaExpr; body: LuaStmt[] }[]; otherwise?: LuaStmt[] }
  | { t: "numfor"; name: string; from: LuaExpr; to: LuaExpr; step?: LuaExpr; body: LuaStmt[] }
  | { t: "infor"; names: string[]; iter: LuaExpr; body: LuaStmt[] }
  | { t: "do"; body: LuaStmt[] }
  | { t: "break" }
  | { t: "return"; value?: LuaExpr }
  | { t: "goto"; label: string }
  | { t: "label"; label: string };

function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  const push = (type: TokenType, value: string) => out.push({ type, value, line });
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let value = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          const e = src[i + 1];
          if (e === "n") value += "\n";
          else if (e === "r") value += "\r";
          else if (e === "t") value += "\t";
          else if (e === "\\") value += "\\";
          else if (e === quote) value += quote;
          else value += e;
          i += 2;
        } else {
          value += src[i++];
        }
      }
      i++;
      push("string", value);
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let value = c;
      i++;
      while (i < src.length && /[0-9.]/.test(src[i])) value += src[i++];
      push("number", value);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let value = c;
      i++;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) value += src[i++];
      push("name", value);
      continue;
    }
    for (const op of ["==", "~=", "<=", ">=", "..", "::"]) {
      if (src.startsWith(op, i)) {
        push("op", op);
        i += op.length;
        break;
      }
    }
    if (i < src.length && !"=<>+-*/%#(){}[];,.".includes(src[i])) {
      // unknown character: skip defensively
      i++;
      continue;
    }
    push("op", src[i]);
    i++;
  }
  push("eof", "");
  return out;
}

class Parser {
  private p = 0;
  constructor(private tokens: Token[]) {}
  private peek(offset = 0) { return this.tokens[Math.min(this.p + offset, this.tokens.length - 1)]; }
  private next() { return this.tokens[this.p++]; }
  private is(value: string) { return this.peek().value === value; }
  private accept(value: string) { if (this.is(value)) { this.p++; return true; } return false; }
  private expect(value: string) {
    if (!this.accept(value)) throw new Error(`Lua: expected ${value} near line ${this.peek().line}, got ${this.peek().value}`);
  }
  private skipSeps() { while (this.is(";") || this.is(",")) this.p++; }
  parse(): LuaStmt[] { return this.block(new Set(["end", "else", "elseif", "until", "eof"])); }
  private block(stops: Set<string>): LuaStmt[] {
    const body: LuaStmt[] = [];
    while (!stops.has(this.peek().value)) {
      if (this.peek().type === "eof") break;
      const s = this.statement();
      if (s) body.push(s);
      this.skipSeps();
    }
    return body;
  }
  private statement(): LuaStmt | null {
    const t = this.peek();
    if (t.value === "local") {
      this.next();
      const name = this.next().value;
      if (this.accept("=")) return { t: "local", name, value: this.expr() };
      return { t: "local", name };
    }
    if (t.value === "if") {
      this.next();
      const branches = [];
      let cond = this.expr();
      this.expect("then");
      let body = this.block(new Set(["end", "else", "elseif"]));
      branches.push({ cond, body });
      while (this.accept("elseif")) {
        cond = this.expr();
        this.expect("then");
        body = this.block(new Set(["end", "else", "elseif"]));
        branches.push({ cond, body });
      }
      let otherwise;
      if (this.accept("else")) otherwise = this.block(new Set(["end"]));
      this.expect("end");
      return { t: "if", branches, otherwise };
    }
    if (t.value === "for") {
      this.next();
      const first = this.next().value;
      if (this.accept("=")) {
        const from = this.expr();
        this.expect(",");
        const to = this.expr();
        let step;
        if (this.accept(",")) step = this.expr();
        this.expect("do");
        const body = this.block(new Set(["end"]));
        this.expect("end");
        return { t: "numfor", name: first, from, to, step, body };
      }
      const names = [first];
      while (this.accept(",")) names.push(this.next().value);
      this.expect("in");
      const iter = this.expr();
      this.expect("do");
      const body = this.block(new Set(["end"]));
      this.expect("end");
      return { t: "infor", names, iter, body };
    }
    if (t.value === "do") {
      this.next();
      const body = this.block(new Set(["end"]));
      this.expect("end");
      return { t: "do", body };
    }
    if (t.value === "return") {
      this.next();
      if (["end", "else", "elseif", ";", "eof"].includes(this.peek().value)) return { t: "return" };
      return { t: "return", value: this.expr() };
    }
    if (t.value === "break") { this.next(); return { t: "break" }; }
    if (t.value === "goto") { this.next(); return { t: "goto", label: this.next().value }; }
    if (t.value === "::") {
      this.next();
      const label = this.next().value;
      this.expect("::");
      return { t: "label", label };
    }
    if (t.value === "function" || t.value === "while" || t.value === "repeat") {
      // not used by quest scripts; consume to the matching end defensively.
      this.next();
      let depth = 1;
      while (depth > 0 && this.peek().type !== "eof") {
        if (["if", "for", "do", "function", "while", "repeat"].includes(this.peek().value)) depth++;
        if (this.peek().value === "end") depth--;
        this.next();
      }
      return null;
    }
    if (t.type === "name") {
      const save = this.p;
      let target: LuaExpr = { t: "name", name: this.next().value };
      let chained = false;
      while (true) {
        if (this.accept("[")) {
          const key = this.expr();
          this.expect("]");
          target = { t: "index", obj: target, key };
          chained = true;
        } else if (this.accept(".")) {
          target = { t: "member", obj: target, name: this.next().value };
          chained = true;
        } else {
          break;
        }
      }
      if (chained && this.accept("=")) return { t: "assignTarget", target, value: this.expr() };
      this.p = save;
    }
    if (t.type === "name" && this.peek(1).value === "=") {
      this.next();
      this.next();
      return { t: "assign", name: t.value, value: this.expr() };
    }
    return { t: "call", value: this.expr() };
  }
  private expr(): LuaExpr { return this.binary(0); }
  private prec(op: string): number {
    if (op === "or") return 1;
    if (op === "and") return 2;
    if (["==", "~=", "<>", "<", ">", "<=", ">="].includes(op)) return 3;
    if (op === "..") return 4;
    if (op === "+" || op === "-") return 5;
    if (["*", "/", "%"].includes(op)) return 6;
    return 0;
  }
  private binary(min: number): LuaExpr {
    let left = this.unary();
    for (;;) {
      const op = this.peek().value;
      const p = this.prec(op);
      if (p === 0 || p <= min) break;
      this.next();
      const right = this.binary(op === ".." ? p - 1 : p);
      left = { t: "bin", op, l: left, r: right };
    }
    return left;
  }
  private unary(): LuaExpr {
    if (["not", "-", "#"].includes(this.peek().value)) {
      const op = this.next().value;
      return { t: "un", op, v: this.unary() };
    }
    return this.postfix();
  }
  private postfix(): LuaExpr {
    let node = this.primary();
    for (;;) {
      if (this.accept("(")) {
        const args: LuaExpr[] = [];
        if (!this.is(")")) {
          args.push(this.expr());
          while (this.accept(",")) args.push(this.expr());
        }
        this.expect(")");
        node = { t: "call", fn: node, args };
      } else if (this.accept("[")) {
        const key = this.expr();
        this.expect("]");
        node = { t: "index", obj: node, key };
      } else if (this.accept(".")) {
        node = { t: "member", obj: node, name: this.next().value };
      } else break;
    }
    return node;
  }
  private primary(): LuaExpr {
    const t = this.next();
    if (t.type === "number") return { t: "lit", v: Number(t.value) };
    if (t.type === "string") return { t: "lit", v: t.value };
    if (t.value === "true") return { t: "lit", v: true };
    if (t.value === "false") return { t: "lit", v: false };
    if (t.value === "nil") return { t: "lit", v: null };
    if (t.value === "(") {
      const e = this.expr();
      this.expect(")");
      return e;
    }
    if (t.value === "{") {
      const items: LuaExpr[] = [];
      while (!this.is("}")) {
        items.push(this.expr());
        if (!this.accept(",") && !this.accept(";")) break;
      }
      this.expect("}");
      return { t: "table", items };
    }
    if (t.type === "name") return { t: "name", name: t.value };
    throw new Error(`Lua: unexpected token ${t.value} on line ${t.line}`);
  }
}

export function parseLuaSource(source: string): LuaStmt[] {
  return new Parser(lex(source)).parse();
}

export interface LuaHost {
  env: Map<string, unknown>;
  call(name: string, args: unknown[]): Promise<unknown>;
}
class ReturnSignal { constructor(public value: unknown) {} }
class BreakSignal {}
class GotoSignal { constructor(public label: string) {} }

class Scope {
  vars = new Map<string, unknown>();
  constructor(public parent?: Scope) {}
  get(name: string): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    return this.parent?.get(name);
  }
  set(name: string, value: unknown) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent && this.parent.has(name)) { this.parent.set(name, value); return; }
    this.vars.set(name, value);
  }
  has(name: string): boolean { return this.vars.has(name) || !!this.parent?.has(name); }
}

function truthy(v: unknown) { return v !== false && v !== null && v !== undefined; }
function luaEq(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return a === b;
}
function luaStr(v: unknown): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
	return String(v);
}

export class LuaRuntime {
  private source: { ast?: LuaStmt[]; error?: string; src: string };
  constructor(private host: LuaHost, public sourceText: string) {
    this.source = { src: sourceText };
  }
  private parse() {
    if (!this.source.ast && !this.source.error) {
      try { this.source.ast = new Parser(lex(this.source.src)).parse(); }
      catch (e) { this.source.error = e instanceof Error ? e.message : String(e); }
    }
    if (this.source.error) throw new Error(this.source.error);
    return this.source.ast!;
  }
  async run() {
    const scope = new Scope();
    try { await this.execBlock(this.parse(), scope); }
    catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      if (e instanceof BreakSignal || e instanceof GotoSignal) return undefined;
      throw e;
    }
    return undefined;
  }
  private async execBlock(body: LuaStmt[], scope: Scope) {
    const labels = new Map<string, number>();
    body.forEach((s, i) => { if (s.t === "label") labels.set(s.label, i); });
    let pc = 0;
    while (pc < body.length) {
      try {
        await this.exec(body[pc], scope);
        pc++;
      } catch (e) {
        if (e instanceof GotoSignal) {
          const target = labels.get(e.label);
          if (target !== undefined) { pc = target + 1; continue; }
        }
        throw e;
      }
    }
  }
  private async exec(stmt: LuaStmt, scope: Scope): Promise<void> {
    switch (stmt.t) {
      case "local": {
        const v = stmt.value ? await this.eval(stmt.value, scope) : null;
        scope.vars.set(stmt.name, v);
        return;
      }
      case "assign": {
        const v = await this.eval(stmt.value, scope);
        scope.set(stmt.name, v);
        return;
      }
      case "assignTarget": {
        const v = await this.eval(stmt.value, scope);
        const target = stmt.target;
        if (target.t === "index") {
          const obj = await this.eval(target.obj, scope) as Record<string, unknown>;
          const key = await this.eval(target.key, scope);
          obj[String(key)] = v;
        } else if (target.t === "member") {
          const obj = await this.eval(target.obj, scope) as Record<string, unknown>;
          obj[target.name] = v;
        } else if (target.t === "name") {
          scope.set(target.name, v);
        }
        return;
      }
      case "call": { await this.eval(stmt.value, scope); return; }
      case "if": {
        for (const b of stmt.branches) {
          if (truthy(await this.eval(b.cond, scope))) { await this.execBlock(b.body, new Scope(scope)); return; }
        }
        if (stmt.otherwise) await this.execBlock(stmt.otherwise, new Scope(scope));
        return;
      }
      case "numfor": {
        const from = Number(await this.eval(stmt.from, scope));
        const to = Number(await this.eval(stmt.to, scope));
        const step = stmt.step ? Number(await this.eval(stmt.step, scope)) : 1;
        const loopScope = new Scope(scope);
        for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
          loopScope.vars.set(stmt.name, i);
          try { await this.execBlock(stmt.body, loopScope); }
          catch (e) { if (e instanceof BreakSignal) break; throw e; }
        }
        return;
      }
      case "infor": {
        const iter = await this.eval(stmt.iter, scope);
        const rows = Array.isArray(iter) ? iter : [];
        const loopScope = new Scope(scope);
        for (const row of rows) {
          if (Array.isArray(row)) row.forEach((v, i) => { if (stmt.names[i]) loopScope.vars.set(stmt.names[i], v); });
          try { await this.execBlock(stmt.body, loopScope); }
          catch (e) { if (e instanceof BreakSignal) break; throw e; }
        }
        return;
      }
      case "do": await this.execBlock(stmt.body, new Scope(scope)); return;
      case "break": throw new BreakSignal();
      case "return": throw new ReturnSignal(stmt.value ? await this.eval(stmt.value, scope) : undefined);
      case "goto": throw new GotoSignal(stmt.label);
      case "label": return;
    }
  }
  private async eval(expr: LuaExpr, scope: Scope): Promise<unknown> {
    switch (expr.t) {
      case "lit": return expr.v;
      case "name": return this.host.env.has(expr.name) ? this.host.env.get(expr.name) : scope.get(expr.name);
      case "table": {
        const out: unknown[] = [];
        for (const item of expr.items) out.push(await this.eval(item, scope));
        return out;
      }
      case "index": {
        const obj = await this.eval(expr.obj, scope);
        const key = await this.eval(expr.key, scope);
        return (obj as Record<string, unknown>)?.[String(key)];
      }
      case "member": {
        const obj = await this.eval(expr.obj, scope);
        return (obj as Record<string, unknown>)?.[expr.name];
      }
      case "call": {
        const args = [];
        for (const a of expr.args) args.push(await this.eval(a, scope));
        if (expr.fn.t === "name") return this.host.call(expr.fn.name, args);
        if (expr.fn.t === "member" && expr.fn.obj.t === "name" && expr.fn.obj.name === "string" && expr.fn.name === "format") {
          return luaFormat(String(args[0] ?? ""), args.slice(1));
        }
        const fn = await this.eval(expr.fn, scope);
        if (typeof fn === "function") return (fn as (...a: unknown[]) => unknown)(...args);
        return undefined;
      }
      case "un": {
        const v = await this.eval(expr.v, scope);
        if (expr.op === "not") return !truthy(v);
        if (expr.op === "-") return -Number(v);
        if (expr.op === "#") return Array.isArray(v) ? v.length : typeof v === "string" ? v.length : 0;
        return null;
      }
      case "bin": {
        if (expr.op === "and") {
          const l = await this.eval(expr.l, scope);
          return truthy(l) ? this.eval(expr.r, scope) : l;
        }
        if (expr.op === "or") {
          const l = await this.eval(expr.l, scope);
          return truthy(l) ? l : this.eval(expr.r, scope);
        }
        const l = await this.eval(expr.l, scope);
        const r = await this.eval(expr.r, scope);
        switch (expr.op) {
          case "==": return luaEq(l, r);
          case "~=": case "<>": return !luaEq(l, r);
          case "<": return Number(l) < Number(r);
          case ">": return Number(l) > Number(r);
          case "<=": return Number(l) <= Number(r);
          case ">=": return Number(l) >= Number(r);
          case "..": return luaStr(l) + luaStr(r);
          case "+": return Number(l) + Number(r);
          case "-": return Number(l) - Number(r);
          case "*": return Number(l) * Number(r);
          case "/": return Number(l) / Number(r);
          case "%": return Number(l) % Number(r);
        }
        return null;
      }
    }
  }
}

function luaFormat(fmt: string, args: unknown[]) {
  let i = 0;
  return fmt.replace(/%([0-9.+\-]*)([dioxXfgs%])/g, (_m, spec: string, kind: string) => {
    if (kind === "%") return "%";
    const v = args[i++];
    if (kind === "d" || kind === "i") return String(Math.trunc(Number(v)));
    if (kind === "f") {
      const digits = spec.includes(".") ? Number(spec.split(".")[1]) : 6;
      return Number(v).toFixed(digits);
    }
    if (kind === "s") return luaStr(v);
    return String(v);
  });
}
