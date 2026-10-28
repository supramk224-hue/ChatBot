import { messages } from '../core/messages.js';
import { normalizeText } from '../core/text.js';

const INTERRUPTS = [
  { name: 'cancel', phrases: ['cancelar', 'cancela', 'abortar'] },
  { name: 'back', phrases: ['voltar', 'volta'] },
  { name: 'menu', phrases: ['menu', 'opcoes'] },
  { name: 'help', phrases: ['ajuda', 'help', 'comandos'] },
  { name: 'human', phrases: ['atendente', 'falar com atendente', 'falar com humano', 'transbordo'] },
];

const ORDERED_INTERRUPTS = INTERRUPTS
  .flatMap((item) => item.phrases.map((phrase) => ({ name: item.name, phrase: normalizeText(phrase) })))
  .sort((left, right) => right.phrase.length - left.phrase.length);

export class FallbackHandler {
  constructor({ maxFailures = 3 } = {}) {
    this.maxFailures = maxFailures;
  }

  matchInterrupt(text) {
    const normalized = normalizeText(text);
    const found = ORDERED_INTERRUPTS.find((item) => item.phrase === normalized);
    return found ? { name: found.name } : null;
  }

  nextFailure(conversation) {
    conversation.failureCount = (conversation.failureCount || 0) + 1;
    if (conversation.failureCount === 1) {
      return { action: 'reprompt', message: messages.fallback1 };
    }
    if (conversation.failureCount < this.maxFailures) {
      return { action: 'help', message: messages.fallback2 };
    }
    conversation.failureCount = 0;
    return { action: 'handoff', message: messages.fallback3 };
  }

  reset(conversation) {
    conversation.failureCount = 0;
  }
}
