import assert from 'node:assert/strict';
import test from 'node:test';
import { messages } from '../src/core/messages.js';
import { TurnContext } from '../src/core/TurnContext.js';
import { DialogSet } from '../src/dialogs/DialogSet.js';
import { WaterfallDialog } from '../src/dialogs/WaterfallDialog.js';
import { createAmbiguityResolverDialog, createHelpDialog } from '../src/router/AmbiguityResolverDialog.js';
import { FallbackHandler } from '../src/router/FallbackHandler.js';
import { createEnterpriseRecognizer } from '../src/router/IntentRecognizer.js';
import { IntentRouter } from '../src/router/IntentRouter.js';

function harness() {
  const dialogs = new DialogSet();
  dialogs
    .add(createHelpDialog())
    .add(createAmbiguityResolverDialog())
    .add(new WaterfallDialog('onboarding', [
      async (step) => step.prompt('QUAL_NOME'),
    ]))
    .add(new WaterfallDialog('mainMenu', [
      async (step) => step.prompt('MENU_PRINCIPAL'),
    ]))
    .add(new WaterfallDialog('humanHandoff', [
      async (step) => step.prompt('CONFIRMA_HUMANO'),
    ]))
    .add(new WaterfallDialog('billingInquiry', [
      async (step) => {
        await step.context.sendActivity('FLUXO_COBRANCA');
        return step.endDialog({ category: 'billing' });
      },
    ]))
    .add(new WaterfallDialog('supportTicket', [
      async (step) => {
        if (step.reason !== 'input') {
          return step.prompt('QUAL_ASSUNTO');
        }
        step.values.subject = step.result;
        return step.next(step.result);
      },
      async (step) => {
        if (step.reason !== 'input') {
          return step.prompt('QUAL_DESCRICAO');
        }
        return step.endDialog({ subject: step.values.subject, description: step.result });
      },
    ]));

  const conversation = { dialogStack: [], slots: {}, failureCount: 0 };
  const router = new IntentRouter({
    recognizer: createEnterpriseRecognizer(),
    fallback: new FallbackHandler(),
  });

  return {
    conversation,
    async say(text) {
      const context = new TurnContext({
        userId: 'ana',
        conversationId: 'ana-1',
        text,
        channelId: 'test',
      });
      const dc = dialogs.createContext(context, conversation);
      await router.route(dc);
      return {
        texts: context.responses.map((item) => item.text),
        stack: conversation.dialogStack.map((item) => item.id),
      };
    },
  };
}

test('classifica comando exato, regex e extrai entidades', () => {
  const recognizer = createEnterpriseRecognizer();
  const exact = recognizer.recognize('Suporte');
  assert.equal(exact.topIntent.name, 'support');
  assert.equal(exact.topIntent.score, 1);
  assert.equal(exact.ambiguous, false);

  const sentence = recognizer.recognize('Preciso abrir um chamado para ana@example.com protocolo TCK-12AB');
  assert.equal(sentence.topIntent.name, 'support');
  assert.ok(sentence.topIntent.score >= 0.9);
  assert.equal(sentence.ambiguous, false);
  assert.deepEqual(sentence.topIntent.entities.map((entity) => entity.type), ['email', 'ticketId']);
});

test('detecta empate entre chamado de suporte e cobrança', () => {
  const recognition = createEnterpriseRecognizer().recognize('chamado');
  assert.equal(recognition.ambiguous, true);
  assert.ok(recognition.candidates.some((candidate) => candidate.name === 'support'));
  assert.ok(recognition.candidates.some((candidate) => candidate.name === 'billing'));
});

test('desambigua a escolha e abre o fluxo correspondente', async () => {
  const bot = harness();
  const ask = await bot.say('chamado');
  const prompt = ask.texts[0];
  assert.match(prompt, /Você quis dizer/);
  assert.deepEqual(ask.stack, ['ambiguity']);

  const billingLine = prompt.split('\n').find((line) => /cobran/i.test(line));
  const option = billingLine.match(/^(\d+)\./)[1];
  const chosen = await bot.say(option);
  assert.deepEqual(chosen.texts, ['FLUXO_COBRANCA']);
  assert.deepEqual(chosen.stack, []);
});

test('comando claro entra no fluxo e interrupções globais pausam ou cancelam', async () => {
  const bot = harness();
  const started = await bot.say('abrir chamado');
  assert.deepEqual(started.texts, ['QUAL_ASSUNTO']);

  const helped = await bot.say('ajuda');
  assert.equal(helped.texts[0], messages.help);
  assert.equal(helped.texts.at(-1), 'QUAL_ASSUNTO');
  assert.deepEqual(helped.stack, ['supportTicket']);

  const described = await bot.say('impressora sem tinta');
  assert.deepEqual(described.texts, ['QUAL_DESCRICAO']);

  const back = await bot.say('voltar');
  assert.deepEqual(back.texts, ['QUAL_ASSUNTO']);
  assert.equal(bot.conversation.dialogStack[0].state.stepIndex, 0);

  const cancelled = await bot.say('cancelar');
  assert.deepEqual(cancelled.texts, [messages.cancelled]);
  assert.deepEqual(cancelled.stack, []);
});

test('escala para atendimento humano depois de falhas repetidas', async () => {
  const bot = harness();
  const first = await bot.say('asdfgh');
  const second = await bot.say('qwerty');
  const third = await bot.say('zxcvbn');

  assert.equal(first.texts[0], messages.fallback1);
  assert.equal(second.texts[0], messages.fallback2);
  assert.equal(third.texts[0], messages.fallback3);
  assert.equal(third.texts[1], 'CONFIRMA_HUMANO');
  assert.deepEqual(third.stack, ['humanHandoff']);
});
