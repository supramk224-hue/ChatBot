const DEFAULT_MAX_LENGTH = 2000;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+|your\s+)?(instructions|rules|guidelines)/i,
  /you\s+are\s+now\b/i,
  /system\s+prompt/i,
  /\bjailbreak\b/i,
  /reveal\s+(your\s+)?(system\s+)?(instructions|prompt)/i,
  /esque[cç]a\s+(todas\s+)?(as\s+)?instruc[oõ]es/i,
  /ignor[ea]\s+(todas\s+)?(as\s+)?instruc[oõ]es(\s+anteriores)?/i,
  /voc[eê]\s+agora\s+(e|é)\b/i,
  /modo\s+(desenvolvedor|developer|deus|admin)\b/i,
  /override\s+(the\s+)?(system|safety|rules)/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
];

const XSS_PATTERNS = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*svg\b/i,
  /javascript\s*:/i,
  /\bon(error|load|click|mouseover)\s*=/i,
];

const COMMAND_INJECTION_PATTERNS = [
  /(?:^|[;&|])\s*(?:rm|del|erase|curl|wget|bash|sh|powershell|cmd|chmod|shutdown)\b/i,
  /\$\([^)]*\)/,
  /\b(?:rm|curl|wget)\s+-[a-z]/i,
];

const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function findPollution(value, depth = 0) {
  if (depth > 8 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return /__proto__|constructor\s*\.\s*prototype|\bprototype\s*\[/.test(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (POLLUTION_KEYS.has(key) || findPollution(value[key], depth + 1)) {
      return true;
    }
  }

  return false;
}

function stripMarkup(text) {
  return text.replace(/<[^>]*>/g, '');
}

export function sanitizeInput(input, options = {}) {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const violations = [];
  const source = typeof input === 'string' ? input : input == null ? '' : JSON.stringify(input);

  if (findPollution(input) || findPollution(options.metadata) || findPollution(source)) {
    violations.push('prototype-pollution');
  }

  let text = source;
  if (text.length > maxLength) {
    violations.push('max-length');
    text = text.slice(0, maxLength);
  }

  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(source))) {
    violations.push('prompt-injection');
  }

  if (XSS_PATTERNS.some((pattern) => pattern.test(source))) {
    violations.push('xss');
  }

  if (COMMAND_INJECTION_PATTERNS.some((pattern) => pattern.test(source))) {
    violations.push('command-injection');
  }

  const uniqueViolations = [...new Set(violations)];
  const blocked = uniqueViolations.length > 0;

  return {
    ok: !blocked,
    blocked,
    text: stripMarkup(text).trim(),
    violations: uniqueViolations,
  };
}
