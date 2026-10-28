import { randomBytes } from 'node:crypto';
import { isNo, isYes, priorityLabel } from '../core/text.js';
import { WaterfallDialog } from '../dialogs/WaterfallDialog.js';

export function buildHandoffSummary(profile, conversation, options = {}) {
  const lines = [
    'Resumo para o atendente:',
    `Cliente: ${profile?.name || 'não identificado'}`,
    `Motivo: ${options.reason || 'solicitação do usuário'}`,
  ];
  const ticket = conversation?.slots?.ticket;
  if (ticket) {
    lines.push(`Chamado: ${ticket.id} — ${ticket.subject} (${priorityLabel(ticket.priority)})`);
  } else if (conversation?.slots?.subject) {
    lines.push(`Assunto parcial: ${conversation.slots.subject}`);
  }
  if (!ticket && conversation?.slots?.description) {
    lines.push(`Descrição parcial: ${conversation.slots.description}`);
  }

  const recent = (conversation?.conversationHistory || []).slice(-3);
  if (recent.length > 0) {
    lines.push('Últimos turnos:');
    for (const turn of recent) {
      lines.push(`- Usuário: ${turn.userText}`);
    }
  }
  return lines.join('\n');
}

export function createHumanHandoffDialog() {
  return new WaterfallDialog('humanHandoff', [
    async (step) => {
      const profile = step.context.turnState.get('userProfile');
      const conversation = step.context.turnState.get('conversationData');
      step.values.summary = buildHandoffSummary(profile, conversation, step.options || {});
      if (step.reason !== 'input') {
        step.values.attempts = 0;
        return step.prompt(`${step.values.summary}\nConfirma a transferência para um atendente humano? (sim/nao)`);
      }
      if (isYes(step.result)) {
        return step.next(true);
      }
      if (isNo(step.result)) {
        return step.next(false);
      }
      step.values.attempts += 1;
      if (step.values.attempts >= 3) {
        await step.context.sendActivity('Não consegui confirmar a transferência. Envie menu para continuar.');
        return step.endDialog({ handoff: false });
      }
      return step.prompt('Responda sim para transferir ou nao para permanecer neste atendimento.');
    },
    async (step) => {
      if (step.result !== true) {
        await step.context.sendActivity('Transferência cancelada.');
        return step.endDialog({ handoff: false });
      }

      const protocol = `HUM-${randomBytes(3).toString('hex').toUpperCase()}`;
      const conversation = step.context.turnState.get('conversationData');
      conversation.slots.handoff = {
        protocol,
        summary: step.values.summary,
        at: new Date().toISOString(),
      };
      await step.context.sendActivity(`Transferência registrada. Protocolo ${protocol}. Um atendente continuará o atendimento.`);
      return step.endDialog({ handoff: true, protocol, summary: step.values.summary });
    },
  ]);
}
