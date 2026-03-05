/**
 * Replaces {{key}} placeholders in a string with values from vars.
 * Whitespace inside braces is trimmed. Missing keys are left as-is.
 */
export function template(str: string, vars: Record<string, string | number | boolean>): string {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`
  );
}

/**
 * Like template but throws an Error if any placeholder has no matching var.
 */
export function templateStrict(str: string, vars: Record<string, string | number | boolean>): string {
  let missing: string | undefined;
  const result = str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) { missing = key; return `{{${key}}}`; }
    return String(vars[key]);
  });
  if (missing) throw new Error(`Missing template variable: ${missing}`);
  return result;
}

/** Extracts unique variable names from {{placeholders}}. */
export function extractVariables(str: string): string[] {
  const vars = new Set<string>();
  str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars.add(key));
  return Array.from(vars);
}

/** Escapes HTML special characters: & < > " ' */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

/** Unescapes HTML entities back to characters. */
export function unescapeHtml(str: string): string {
  return str.replace(/&(amp|lt|gt|quot|#39);/g, e => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[e] || e));
}

/** Truncates string to maxLength, appending suffix if truncated. Default suffix='...'. */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  return str.length <= maxLength ? str : str.slice(0, maxLength - suffix.length) + suffix;
}