const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const BEARER_PATTERN = /\b(bearer)\s+[a-z0-9\-._~+/]+=*/gi;
const SECRET_PATTERN = /\b(senha|password|token|api[_-]?key|secret)\b\s*[:=]\s*\S+/gi;

export function redactPii(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(CARD_PATTERN, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 ? '[CARD]' : match;
    })
    .replace(CPF_PATTERN, '[CPF]')
    .replace(BEARER_PATTERN, '$1 [TOKEN]')
    .replace(SECRET_PATTERN, '$1=[SECRET]');
}

function redactValue(value, depth = 0) {
  if (depth > 6 || value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return redactPii(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  const redacted = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      continue;
    }
    redacted[key] = redactValue(nested, depth + 1);
  }
  return redacted;
}

export class Logger {
  constructor({ writeToConsole = false, clock = () => new Date() } = {}) {
    this.writeToConsole = writeToConsole;
    this.clock = clock;
    this.entries = [];
  }

  write(level, message, fields = {}) {
    const entry = {
      timestamp: this.clock().toISOString(),
      level,
      message: redactPii(String(message)),
      ...redactValue(fields),
    };
    this.entries.push(entry);

    if (this.writeToConsole) {
      const sink = level === 'error' ? console.error : console.log;
      sink(JSON.stringify(entry));
    }

    return entry;
  }

  info(message, fields) {
    return this.write('info', message, fields);
  }

  warn(message, fields) {
    return this.write('warn', message, fields);
  }

  error(message, fields) {
    return this.write('error', message, fields);
  }
}
