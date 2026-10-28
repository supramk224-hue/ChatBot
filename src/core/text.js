export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsTerm(normalized, term) {
  const needle = normalizeText(term);
  if (!needle) {
    return false;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normalized);
}

export function isYes(text) {
  return ['sim', 's', 'confirmo', 'confirmar', 'yes', 'ok'].includes(normalizeText(text));
}

export function isNo(text) {
  return ['nao', 'n', 'no'].includes(normalizeText(text));
}

export function normalizePriority(text) {
  const value = normalizeText(text);
  if (['1', 'baixa', 'baixo'].includes(value)) return 'baixa';
  if (['2', 'media', 'medio'].includes(value)) return 'media';
  if (['3', 'alta', 'alto', 'urgente'].includes(value)) return 'alta';
  return null;
}

export function priorityLabel(priority) {
  if (priority === 'media') return 'média';
  return priority || '';
}
