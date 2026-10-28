import { messages } from '../core/messages.js';
import { normalizeText } from '../core/text.js';

const INTERRUPT_RULES = [
  {
    name: 'human',
    test: (text) => /^(atendente|humano|operador|transbordo)$/.test(text)
      || /falar\s+com\s+(um\s+|uma\s+|o\s+|a\s+)?(atendente|humano|pessoa|gente|operador)/.test(text)
      || /(passa|passar|transferir|transfere)\s+(pra|para)\s+(um\s+|uma\s+)?(atendente|humano|pessoa)/.test(text)
      || /atendimento\s+humano/.test(text),
  },
  {
    name: 'cancel',
    test: (text) => /^(por favor\s+)?(quero\s+|pode\s+|podia\s+)?cancel(ar|a)(\s+isso|\s+o fluxo|\s+este fluxo)?$/.test(text)
      || text === 'abortar',
  },
  {
    name: 'back',
    test: (text) => /^(voltar|volta)(\s+atras|\s+ao menu|\s+pro menu|\s+para o menu)?$/.test(text)
      || text === 'passo anterior',
  },
  {
    name: 'menu',
    test: (text) => /^(quero\s+|ir\s+para\s+|ir\s+pro\s+)?(o\s+)?menu(\s+principal)?$/.test(text)
      || text === 'opcoes'
      || text === 'inicio',
  },
  {
    name: 'help',
    test: (text) => /^(me ajuda|pode me ajudar|preciso de ajuda|ajuda|help|comandos)(\s+por favor)?$/.test(text),
  },
];

export class FallbackHandler {
  constructor({ maxFailures = 3 } = {}) {
    this.maxFailures = maxFailures;
  }

  matchInterrupt(text) {
    const normalized = normalizeText(text);
    const found = INTERRUPT_RULES.find((rule) => rule.test(normalized));
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
