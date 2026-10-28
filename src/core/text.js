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
  const value = normalizeText(text);
  return [
    'sim', 's', 'confirmo', 'confirmar', 'confirma', 'yes', 'ok',
    'pode ser', 'pode registrar', 'pode abrir', 'pode sim',
    'isso', 'isso mesmo', 'claro', 'positivo', 'fechado',
  ].includes(value);
}

export function isNo(text) {
  const value = normalizeText(text);
  return [
    'nao', 'n', 'no', 'negativo', 'melhor nao', 'nao quero',
    'nao confirma', 'deixa quieto', 'prefiro nao',
  ].includes(value);
}

export function normalizePriority(text) {
  const value = normalizeText(text);
  if (value === '1' || /\b(baixa|baixo)\b/.test(value)) return 'baixa';
  if (value === '2' || /\b(media|medio)\b/.test(value)) return 'media';
  if (value === '3' || /\b(alta|alto|urgente|urgentissimo)\b/.test(value)) return 'alta';
  return null;
}

export function priorityLabel(priority) {
  if (priority === 'media') return 'média';
  return priority || '';
}
