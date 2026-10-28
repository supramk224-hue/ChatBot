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
      strong: extra.strong || [],
      weak: extra.weak || [],
      matchTerms: extra.matchTerms || [],
    });
  }

  recognize(text) {
    const normalized = normalizeText(text);
    const entities = extractEntities(text);
    const ranked = this.intents
      .map((intent) => this.scoreIntent(intent, normalized, entities))
      .filter((intent) => intent.score > 0)
      .sort((left, right) => right.score - left.score);

    const social = new Set(['greeting', 'help', 'menu']);
    const business = ranked.filter((intent) => !social.has(intent.name));
    const pool = business.some((intent) => intent.score >= 0.7) ? business : ranked;
    const top = pool[0] ?? null;
    const second = pool[1] ?? null;
    const candidates = pool.filter((intent) => intent.score >= 0.45).slice(0, 3);
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

    const weighted = new Map();
    for (const term of intent.strong || []) weighted.set(normalizeText(term), 0.86);
    for (const term of intent.keywords || []) {
      const key = normalizeText(term);
      if (!weighted.has(key)) weighted.set(key, 0.78);
    }
    for (const term of intent.weak || []) {
      const key = normalizeText(term);
      if (!weighted.has(key)) weighted.set(key, 0.6);
    }

    const hits = [...weighted.entries()].filter(([term]) => term && containsTerm(normalized, term));
    if (hits.length > 0) {
      const best = Math.max(...hits.map(([, weight]) => weight));
      const keywordScore = Math.min(0.95, best + (hits.length - 1) * 0.05);
      score = Math.max(score, roundScore(keywordScore));
    }

    return {
      name: intent.name,
      label: intent.label,
      dialogId: intent.dialogId,
      score: roundScore(score),
      entities,
      matchTerms: (intent.matchTerms || []).map((term) => normalizeText(term)),
    };
  }
}

export function createEnterpriseRecognizer() {
  const recognizer = new IntentRecognizer();
  recognizer.hears(['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'e ai', 'opa'], 'greeting', {
    dialogId: 'onboarding',
    label: 'Começar atendimento',
    strong: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa'],
    matchTerms: ['oi', 'ola', 'saudacao'],
  });
  recognizer.hears(
    [
      'abrir chamado',
      'novo chamado',
      'suporte',
      'consultar chamado',
      'status do chamado',
      /abrir\s+(um\s+)?chamado/,
      /consultar\s+(o\s+|meu\s+)?chamado/,
      /status\s+do\s+(meu\s+)?chamado/,
    ],
    'support',
    {
      dialogId: 'supportTicket',
      label: 'Abrir ou consultar chamado',
      strong: ['suporte', 'ticket'],
      weak: ['chamado', 'problema', 'erro', 'consultar'],
      matchTerms: ['chamado', 'suporte', 'ticket'],
    },
  );
  recognizer.hears(
    [
      'fatura',
      'cobranca',
      'boleto',
      'pagamento',
      /duvida\s+de\s+cobranca/,
      /segunda\s+via/,
      /(fatura|boleto|cobranca).{0,30}(errad|duplicad|duas vezes|indevid)/,
      /(errad|duplicad|duas vezes|indevid).{0,30}(fatura|boleto|cobranca)/,
    ],
    'billing',
    {
      dialogId: 'billingInquiry',
      label: 'Dúvida de cobrança',
      strong: ['fatura', 'cobranca', 'boleto', 'pagamento', 'segunda via'],
      weak: ['chamado'],
      matchTerms: ['cobranca', 'fatura', 'boleto', 'pagamento'],
    },
  );
  recognizer.hears(
    [
      'atendente',
      'humano',
      'falar com atendente',
      'falar com humano',
      /falar\s+com\s+(um\s+|uma\s+)?(atendente|humano|pessoa|operador)/,
      /(passa|passar|transferir)\s+(pra|para)\s+(um\s+|uma\s+)?(atendente|humano|pessoa)/,
    ],
    'humanHandoff',
    {
      dialogId: 'humanHandoff',
      label: 'Falar com atendente',
      strong: ['atendente', 'humano', 'operador'],
      matchTerms: ['atendente', 'humano', 'pessoa'],
    },
  );
  recognizer.hears(['menu', 'opcoes', 'inicio'], 'menu', {
    dialogId: 'mainMenu',
    label: 'Menu principal',
    strong: ['menu', 'opcoes', 'inicio'],
    matchTerms: ['menu', 'opcoes'],
  });
  recognizer.hears(['ajuda', 'help', 'comandos'], 'help', {
    dialogId: 'help',
    label: 'Ajuda',
    strong: ['ajuda', 'help', 'comandos'],
    matchTerms: ['ajuda', 'help'],
  });
  return recognizer;
}
