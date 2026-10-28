import { normalizeText } from '../core/text.js';
import { WaterfallDialog } from '../dialogs/WaterfallDialog.js';

function profileOf(step) {
  return step.context.turnState.get('userProfile');
}

export function createOnboardingDialog() {
  return new WaterfallDialog('onboarding', [
    async (step) => {
      const profile = profileOf(step);
      if (profile?.name) {
        step.values.name = profile.name;
        return step.next(profile.name);
      }
      if (step.reason !== 'input') {
        return step.prompt('Olá! Eu sou o assistente enterprise. Como você gostaria de ser chamado?');
      }

      const rawName = String(step.result ?? '').trim();
      const introduced = rawName.match(/^(?:meu nome é|meu nome e|me chamo|pode me chamar de|eu sou)\s+(.+)$/i);
      const name = (introduced ? introduced[1] : rawName).replace(/[.!?]+$/g, '').trim();
      if (name.length < 2 || name.length > 80) {
        return step.prompt('Informe um nome com pelo menos 2 caracteres.');
      }

      profile.name = name;
      profile.preferences = profile.preferences || {};
      profile.authenticated = Boolean(profile.authenticated);
      step.values.name = name;
      await step.context.sendActivity(`Prazer, ${name}.`);
      return step.next(name);
    },
    async (step) => step.replaceDialog('mainMenu', { name: step.values.name || step.result }),
  ]);
}

export function createMainMenuDialog() {
  return new WaterfallDialog('mainMenu', [
    async (step) => {
      if (step.reason !== 'input') {
        const name = step.options.name || profileOf(step)?.name;
        const greeting = name ? `Olá, ${name}.` : 'Olá.';
        return step.prompt([
          greeting,
          'Escolha uma opção:',
          '1. Abrir ou consultar chamado',
          '2. Falar com atendente',
          '3. Encerrar',
        ].join('\n'));
      }

      const choice = normalizeText(step.result);
      if (choice === '1' || choice === 'suporte') {
        return step.beginDialog('supportTicket');
      }
      if (choice === '2' || choice === 'atendente' || choice === 'humano') {
        return step.beginDialog('humanHandoff', { reason: 'menu' });
      }
      if (['3', 'sair', 'encerrar', 'tchau', 'ate logo'].includes(choice)) {
        await step.context.sendActivity('Até logo. Quando quiser, envie uma mensagem para recomeçar.');
        return step.endDialog({ action: 'exit' });
      }

      const recognition = step.context.turnState.get('recognizer')?.recognize(step.result);
      if (recognition?.ambiguous) {
        return step.beginDialog('ambiguity', {
          candidates: recognition.candidates,
          originalText: step.result,
        });
      }
      if (recognition?.topIntent && recognition.topIntent.score >= 0.75 && recognition.topIntent.dialogId !== 'mainMenu') {
        if (recognition.topIntent.dialogId === 'onboarding') {
          return step.prompt('Você já está no menu. Responda 1, 2 ou 3, ou descreva o que precisa.');
        }
        return step.beginDialog(recognition.topIntent.dialogId, {
          intent: recognition.topIntent.name,
          text: step.result,
          entities: recognition.topIntent.entities || [],
          category: recognition.topIntent.name,
        });
      }
      return step.prompt('Não reconheci a opção. Responda 1, 2 ou 3, ou descreva o problema com suas palavras.');
    },
    async (step) => step.replaceDialog('mainMenu', step.options),
  ]);
}
