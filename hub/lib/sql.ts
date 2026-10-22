import type { InArgs, InStatement, ResultSet } from '@libsql/client';
import { HttpError, plain } from './db.js';

/**
 * Strips comments and quoted text, then checks that what's left is one statement (a trailing `;` is fine).
 * Returns the code with strings and comments blanked out, for the keyword checks below.
 */
export function singleStatement(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end + 1;
      out += ' ';
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close)
            j += 2; // doubled quote is an escape
          else break;
        } else j++;
      }
      // Keep identifiers (they matter for the keyword checks), blank out string literals.
      out += c === "'" ? "''" : sql.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  const code = out.trim().replace(/;\s*$/, '');
  if (!code) throw new HttpError(400, 'Empty SQL');
  if (code.includes(';')) throw new HttpError(400, 'One statement per string, please');
  return code;
}

export type StatementIn = string | { sql: string; args?: InArgs };

export function toStatement(s: StatementIn): InStatement & { sql: string } {
  if (typeof s === 'string') return { sql: s };
  if (!s || typeof s.sql !== 'string') throw new HttpError(400, 'Each statement needs a `sql` string');
  return s.args === undefined ? { sql: s.sql } : { sql: s.sql, args: s.args };
}

/** `{ columns, rows }` with rows as arrays, BigInt turned into numbers. */
export function table(rs: ResultSet) {
  return {
    columns: rs.columns,
    rows: rs.rows.map((r) => rs.columns.map((_c, i) => plain(r[i]))),
  };
}

/** A row as a plain object. */
export function rowObject(rs: ResultSet, r: ResultSet['rows'][number]) {
  const o: Record<string, unknown> = {};
  rs.columns.forEach((c, i) => (o[c] = plain(r[i])));
  return o;
}
