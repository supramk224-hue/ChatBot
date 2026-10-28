import { randomBytes } from 'node:crypto';
import { messages } from '../core/messages.js';
import { isNo, isYes, normalizePriority, normalizeText, priorityLabel } from '../core/text.js';
import { WaterfallDialog } from '../dialogs/WaterfallDialog.js';

function createTicketId() {
  return `TCK-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function askSlot(step, config) {
  const conversation = step.context.turnState.get('conversationData');
  if (step.reason !== 'input') {
    step.values[config.attemptsKey] = 0;
    return step.prompt(config.prompt);
  }

  const value = String(step.result ?? '').trim();
  const recognizer = step.context.turnState.get('recognizer');
  const top = recognizer?.recognize(value).topIntent;
  if (top && top.score >= 0.99 && top.dialogId !== 'supportTicket') {
    await step.context.sendActivity(messages.detour);
    return step.prompt(config.prompt);
  }

  if (!config.validate(value)) {
    const attempts = (step.values[config.attemptsKey] || 0) + 1;
    step.values[config.attemptsKey] = attempts;
    if (attempts === 1) {
      return step.prompt(config.invalid);
    }
    if (attempts === 2) {
      return step.prompt(config.example);
    }
    return step.replaceDialog('humanHandoff', { reason: 'validation-failed', slot: config.key });
  }

  const stored = config.assign ? config.assign(value) : value;
  step.values[config.key] = stored;
  if (conversation) {
    conversation.slots[config.key] = stored;
  }
  return step.next(stored);
}

function looksLikeConsult(text) {
  const value = normalizeText(text);
  return Boolean(value) && (/\bstatus\b/.test(value) || value.startsWith('consultar') || value === 'consulta');
}

function looksLikeOpen(text) {
  const value = normalizeText(text);
  return Boolean(value) && (/abrir\s+(um\s+)?chamado/.test(value) || value === 'novo chamado' || value === 'suporte');
}

async function listTickets(step) {
  const tickets = step.context.turnState.get('userProfile')?.tickets || [];
  if (tickets.length === 0) {
    await step.context.sendActivity('Você ainda não tem chamados registrados.');
    return step.endDialog({ consulted: false });
  }
  const lines = tickets.map((ticket) => `${ticket.id}: ${ticket.subject} (${ticket.status}, prioridade ${priorityLabel(ticket.priority)})`);
  await step.context.sendActivity(`Seus chamados:\n${lines.join('\n')}`);
  return step.endDialog({ consulted: true });
}

export function createSupportTicketDialog() {
  return new WaterfallDialog('supportTicket', [
    async (step) => {
      if (step.reason !== 'input') {
        if (looksLikeConsult(step.options?.text)) return listTickets(step);
        if (looksLikeOpen(step.options?.text)) return step.next('open');
        step.values.modeAttempts = 0;
        return step.prompt('O que você precisa?\n1. Abrir um chamado\n2. Consultar um chamado');
      }

      const choice = normalizeText(step.result);
      if (choice === '2' || choice === 'consultar' || choice === 'consulta' || choice === 'status' || choice.startsWith('consultar') || looksLikeConsult(step.result)) {
        return listTickets(step);
      }

      if (choice === '1' || choice === 'abrir' || choice === 'novo' || choice.startsWith('abrir')) {
        return step.next('open');
      }

      step.values.modeAttempts += 1;
      if (step.values.modeAttempts >= 3) {
        return step.replaceDialog('humanHandoff', { reason: 'validation-failed', slot: 'mode' });
      }
      return step.prompt(step.values.modeAttempts === 1
        ? 'Responda 1 para abrir um chamado ou 2 para consultar.'
        : 'Exemplo: responda 1 para abrir ou 2 para consultar.');
    },
    async (step) => askSlot(step, {
      key: 'subject',
      attemptsKey: 'subjectAttempts',
      prompt: 'Qual é o assunto do chamado? Use pelo menos 5 caracteres.',
      invalid: 'O assunto precisa ter pelo menos 5 caracteres.',
      example: 'Exemplo: "Não consigo acessar o e-mail". Envie o assunto novamente.',
      validate: (value) => value.length >= 5,
    }),
    async (step) => askSlot(step, {
      key: 'description',
      attemptsKey: 'descriptionAttempts',
      prompt: 'Descreva o que aconteceu, com pelo menos 10 caracteres.',
      invalid: 'A descrição precisa ter pelo menos 10 caracteres.',
      example: 'Exemplo: "Ao entrar no aplicativo, a tela fecha depois da senha."',
      validate: (value) => value.length >= 10,
    }),
    async (step) => askSlot(step, {
      key: 'priority',
      attemptsKey: 'priorityAttempts',
      prompt: 'Qual é a prioridade?\n1. Baixa\n2. Média\n3. Alta',
      invalid: 'Escolha a prioridade: 1 baixa, 2 média ou 3 alta.',
      example: 'Responda com o número: 1, 2 ou 3.',
      validate: (value) => normalizePriority(value) != null,
      assign: (value) => normalizePriority(value),
    }),
    async (step) => {
      if (step.reason !== 'input') {
        return step.prompt([
          'Confirme a abertura do chamado:',
          `Assunto: ${step.values.subject}`,
          `Descrição: ${step.values.description}`,
          `Prioridade: ${priorityLabel(step.values.priority)}`,
          'Responda sim para registrar ou nao para cancelar.',
        ].join('\n'));
      }
      if (isYes(step.result)) {
        return step.next(true);
      }
      if (isNo(step.result)) {
        return step.next(false);
      }
      return step.prompt('Responda sim para registrar ou nao para cancelar. Nada será gravado sem confirmação.');
    },
    async (step) => {
      if (step.result !== true) {
        await step.context.sendActivity('Abertura cancelada. Nada foi registrado.');
        return step.endDialog({ confirmed: false });
      }

      const profile = step.context.turnState.get('userProfile');
      const conversation = step.context.turnState.get('conversationData');
      const ticket = {
        id: createTicketId(),
        subject: step.values.subject,
        description: step.values.description,
        priority: step.values.priority,
        status: 'aberto',
        ownerId: step.context.activity.userId,
        createdAt: new Date().toISOString(),
      };
      profile.tickets = profile.tickets || [];
      profile.tickets.push(ticket);
      conversation.slots.ticket = ticket;
      await step.context.sendActivity(`Chamado ${ticket.id} registrado com prioridade ${priorityLabel(ticket.priority)}.`);
      return step.endDialog({ confirmed: true, ticket });
    },
  ]);
}

export function createBillingDialog() {
  return new WaterfallDialog('billingInquiry', [
    async (step) => {
      if (step.reason !== 'input') {
        return step.prompt('Vamos tratar a sua dúvida de cobrança. Informe o número da fatura ou descreva o problema.');
      }
      const detail = String(step.result ?? '').trim();
      if (detail.length < 3) {
        return step.prompt('Preciso de um pouco mais de detalhe sobre a cobrança. Informe a fatura ou descreva o problema.');
      }
      const conversation = step.context.turnState.get('conversationData');
      if (conversation) {
        conversation.slots.billingDetail = detail;
      }
      await step.context.sendActivity('Registrei a sua dúvida de cobrança. Se quiser abrir um chamado formal, escolha essa opção no menu.');
      return step.endDialog({ category: 'cobranca', detail });
    },
  ]);
}
