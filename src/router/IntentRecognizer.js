import { containsTerm, normalizeText } from '../core/text.js';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const TICKET_PATTERN = /\bTCK-[A-Z0-9]+\b/i;

export function extractEntities(text) {
  const source = String(text ?? '');
  const entities = [];
  const email = source.match(EMAIL_PATTERN);
  if (email) {
    entities.push({ type: 'email', value: email[0] });
  }
  const ticket = source.match(TICKET_PATTERN);
  if (ticket) {
    entities.push({ type: 'ticketId', value: ticket[0].toUpperCase() });
  }
  return entities;
}

function roundScore(score) {
  return Math.round(score * 1000) / 1000;
}

export class IntentRecognizer {
  constructor() {
    this.intents = [];
  }

  addIntent(intent) {
    if (!intent?.name || !intent?.dialogId) {
      throw new TypeError('Intent requires name and dialogId.');
    }
    const index = this.intents.findIndex((item) => item.name === intent.name);
    const stored = {
      label: intent.label || intent.name,
      keywords: [],
      exact: [],
      patterns: [],
      ...intent,
    };
    if (index >= 0) {
      this.intents[index] = stored;
    } else {
      this.intents.push(stored);
    }
    return this;
  }

  hears(patterns, name, extra = {}) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const exact = [];
    const regexes = [];
    for (const pattern of list) {
      if (pattern instanceof RegExp) {
        regexes.push(pattern);
      } else {
        exact.push(String(pattern));
      }
    }
    return this.addIntent({
      name,
      label: extra.label || name,
      dialogId: extra.dialogId,
      exact,
      patterns: regexes,
      keywords: extra.keywords || [],
    });
  }

  recognize(text) {
    const normalized = normalizeText(text);
    const entities = extractEntities(text);
    const ranked = this.intents
      .map((intent) => this.scoreIntent(intent, normalized, entities))
      .filter((intent) => intent.score > 0)
      .sort((left, right) => right.score - left.score);

    const top = ranked[0] ?? null;
    const second = ranked[1] ?? null;
    const candidates = ranked.filter((intent) => intent.score >= 0.45).slice(0, 3);
    const ambiguous = Boolean(
      top
      && second
      && top.score < 0.99
      && second.score >= 0.45
      && (
        (top.score >= 0.45 && top.score <= 0.75)
        || top.score - second.score < 0.15
      ),
    );

    return {
      text,
      normalized,
      intents: ranked,
      topIntent: top,
      ambiguous,
      candidates: ambiguous ? candidates : [],
    };
  }

  scoreIntent(intent, normalized, entities) {
    let score = 0;
    if ((intent.exact || []).some((phrase) => normalized === normalizeText(phrase))) {
      score = 1;
    }

    if ((intent.patterns || []).some((pattern) => pattern.test(normalized))) {
      score = Math.max(score, 0.92);
    }

    const terms = (intent.keywords || []).map((keyword) => normalizeText(keyword)).filter(Boolean);
    const matched = terms.filter((term) => containsTerm(normalized, term));
    if (matched.length > 0) {
      const keywordScore = Math.min(0.95, 0.5 + (matched.length / terms.length) * 0.45);
      score = Math.max(score, keywordScore);
    }

    return {
      name: intent.name,
      label: intent.label,
      dialogId: intent.dialogId,
      score: roundScore(score),
      entities,
    };
  }
}

export function createEnterpriseRecognizer() {
  const recognizer = new IntentRecognizer();
  recognizer.hears(['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello'], 'greeting', {
    dialogId: 'onboarding',
    label: 'Começar atendimento',
    keywords: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'],
  });
  recognizer.hears(
    ['abrir chamado', 'novo chamado', 'suporte', 'consultar chamado', 'status do chamado', /abrir\s+(um\s+)?chamado/, /consultar\s+(o\s+)?chamado/, /status\s+do\s+chamado/],
    'support',
    {
      dialogId: 'supportTicket',
      label: 'Abrir ou consultar chamado',
      keywords: ['chamado', 'suporte', 'ticket', 'problema', 'erro', 'consultar'],
    },
  );
  recognizer.hears(
    ['fatura', 'cobranca', 'boleto', 'pagamento', /duvida\s+de\s+cobranca/, /segunda\s+via/],
    'billing',
    {
      dialogId: 'billingInquiry',
      label: 'Dúvida de cobrança',
      keywords: ['fatura', 'cobranca', 'boleto', 'pagamento', 'chamado'],
    },
  );
  recognizer.hears(
    ['atendente', 'humano', 'falar com atendente', 'falar com humano', /falar\s+com\s+(um\s+)?(atendente|humano|operador)/],
    'humanHandoff',
    {
      dialogId: 'humanHandoff',
      label: 'Falar com atendente',
      keywords: ['atendente', 'humano', 'operador'],
    },
  );
  recognizer.hears(['menu', 'opcoes', 'inicio'], 'menu', {
    dialogId: 'mainMenu',
    label: 'Menu principal',
    keywords: ['menu', 'opcoes'],
  });
  recognizer.hears(['ajuda', 'help', 'comandos'], 'help', {
    dialogId: 'help',
    label: 'Ajuda',
    keywords: ['ajuda', 'help'],
  });
  return recognizer;
}
