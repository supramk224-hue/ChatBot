import { messages } from '../core/messages.js';
import { containsTerm, normalizeText } from '../core/text.js';
import { WaterfallDialog } from '../dialogs/WaterfallDialog.js';

const ORDINALS = [
  ['primeira', 'primeiro'],
  ['segunda', 'segundo'],
  ['terceira', 'terceiro'],
];

function chosenIndex(normalized, count) {
  const numbered = normalized.match(/^(?:opcao|numero|n|a|o)?\s*(\d)$/);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (index >= 0 && index < count) return index;
  }

  const ordinal = ORDINALS.findIndex((words) => words.some((word) => containsTerm(normalized, word)));
  if (ordinal >= 0 && ordinal < count && normalized.split(' ').length <= 3) {
    return ordinal;
  }
  return -1;
}

function chooseCandidate(candidates, raw) {
  const normalized = normalizeText(raw);
  const index = chosenIndex(normalized, candidates.length);
  if (index >= 0) return candidates[index];

  let best = null;
  let bestHits = 0;
  for (const candidate of candidates) {
    const label = normalizeText(candidate.label);
    const terms = [...(candidate.matchTerms || []), label].filter((term) => term.length >= 4);
    const hits = terms.filter((term) => term === normalized || containsTerm(normalized, term) || (normalized.length >= 4 && label.includes(normalized))).length;
    if (hits > bestHits) {
      best = candidate;
      bestHits = hits;
    }
  }
  return best;
}

export function createHelpDialog() {
  return new WaterfallDialog('help', [
    async (step) => {
      await step.context.sendActivity(messages.help);
      return step.endDialog({ helped: true });
    },
  ]);
}

export function createAmbiguityResolverDialog() {
  return new WaterfallDialog('ambiguity', [
    async (step) => {
      const candidates = step.options.candidates || [];
      if (step.reason !== 'input') {
        step.values.attempts = 0;
        const lines = candidates.map((candidate, index) => `${index + 1}. ${candidate.label}`);
        return step.prompt([
          'Encontrei mais de uma possibilidade. Você quis dizer:',
          ...lines,
          'Responda com o número, com "a primeira" ou com o nome da opção.',
        ].join('\n'));
      }

      const chosen = chooseCandidate(candidates, step.result);
      if (!chosen) {
        step.values.attempts += 1;
        if (step.values.attempts >= 3) {
          return step.replaceDialog('humanHandoff', { reason: 'ambiguity-failed', text: step.options.originalText });
        }
        return step.prompt('Não identifiquei a opção. Responda com o número da lista.');
      }

      return step.replaceDialog(chosen.dialogId, {
        intent: chosen.name,
        entities: chosen.entities || [],
        text: step.options.originalText,
        category: chosen.name,
      });
    },
  ]);
}
