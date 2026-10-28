import { messages } from '../core/messages.js';
import { WaterfallDialog } from '../dialogs/WaterfallDialog.js';
import { normalizeText } from '../core/text.js';

function chooseCandidate(candidates, raw) {
  const normalized = normalizeText(raw);
  const asNumber = Number.parseInt(normalized, 10);
  if (String(asNumber) === normalized && candidates[asNumber - 1]) {
    return candidates[asNumber - 1];
  }
  return candidates.find((candidate) => normalizeText(candidate.label) === normalized);
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
          'Responda com o número ou o nome da opção.',
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
