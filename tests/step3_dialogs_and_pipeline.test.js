import assert from 'node:assert/strict';
import test from 'node:test';
import { TurnContext } from '../src/core/TurnContext.js';
import { DialogTurnStatus } from '../src/dialogs/Dialog.js';
import { DialogSet } from '../src/dialogs/DialogSet.js';
import { WaterfallDialog } from '../src/dialogs/WaterfallDialog.js';
import { MiddlewarePipeline } from '../src/middlewares/MiddlewarePipeline.js';

function conversation() {
  return { dialogStack: [], slots: {} };
}

async function send(dialogs, state, text, { begin } = {}) {
  const context = new TurnContext({
    userId: 'ana',
    conversationId: 'ana-1',
    text,
    channelId: 'test',
  });
  const dc = dialogs.createContext(context, state);
  const result = begin ? await dc.beginDialog(begin) : await dc.continueDialog();
  return {
    result,
    texts: context.responses.map((item) => item.text),
    stack: state.dialogStack.map((item) => item.id),
  };
}

test('executa middlewares na ordem e permite encerrar a cadeia', async () => {
  const order = [];
  const pipeline = new MiddlewarePipeline();
  pipeline
    .use(async (ctx, next) => {
      order.push('sanitize');
      await next();
      order.push('sanitize-after');
    })
    .use(async (ctx, next) => {
      order.push('rateLimit');
      if (ctx.halt) {
        return;
      }
      await next();
    })
    .use(async (ctx, next) => {
      order.push('route');
      await next();
    });

  await pipeline.run({});
  assert.deepEqual(order, ['sanitize', 'rateLimit', 'route', 'sanitize-after']);

  order.length = 0;
  await pipeline.run({ halt: true });
  assert.deepEqual(order, ['sanitize', 'rateLimit', 'sanitize-after']);
});

test('rejeita next() chamado duas vezes no mesmo middleware', async () => {
  const pipeline = new MiddlewarePipeline().use(async (ctx, next) => {
    await next();
    await next();
  });
  await assert.rejects(pipeline.run({}), /next\(\) called multiple times/);
});

test('waterfall coleta passos e retoma o diálogo pai no ponto seguinte', async () => {
  const dialogs = new DialogSet();
  dialogs.add(new WaterfallDialog('child', [
    async (step) => {
      if (step.reason !== 'input') {
        return step.prompt('Qual é o complemento?');
      }
      return step.endDialog({ complement: step.result });
    },
  ]));
  dialogs.add(new WaterfallDialog('parent', [
    async (step) => {
      if (step.reason !== 'input') {
        return step.prompt('Qual é o assunto?');
      }
      step.values.subject = step.result;
      return step.beginDialog('child');
    },
    async (step) => {
      await step.context.sendActivity(`Registrado: ${step.values.subject} / ${step.result.complement}`);
      return step.endDialog({
        subject: step.values.subject,
        complement: step.result.complement,
      });
    },
  ]));

  const state = conversation();
  const first = await send(dialogs, state, '', { begin: 'parent' });
  assert.deepEqual(first.texts, ['Qual é o assunto?']);
  assert.deepEqual(first.stack, ['parent']);

  const second = await send(dialogs, state, 'acesso');
  assert.deepEqual(second.texts, ['Qual é o complemento?']);
  assert.deepEqual(second.stack, ['parent', 'child']);
  assert.equal(state.dialogStack[0].state.stepIndex, 0);

  const third = await send(dialogs, state, 'vpn');
  assert.deepEqual(third.texts, ['Registrado: acesso / vpn']);
  assert.equal(third.result.status, DialogTurnStatus.Complete);
  assert.deepEqual(third.result.result, { subject: 'acesso', complement: 'vpn' });
  assert.deepEqual(third.stack, []);
});

test('interrupção retoma o mesmo passo e replaceDialog troca o fluxo ativo', async () => {
  const dialogs = new DialogSet();
  dialogs.add(new WaterfallDialog('help', [
    async (step) => {
      await step.context.sendActivity('Ajuda rápida.');
      return step.endDialog({ helped: true });
    },
  ]));
  dialogs.add(new WaterfallDialog('replacement', [
    async (step) => {
      await step.context.sendActivity('Fluxo substituído.');
      return step.endDialog({ replaced: true });
    },
  ]));
  dialogs.add(new WaterfallDialog('main', [
    async (step) => {
      if (step.reason !== 'input') {
        return step.prompt('Informe o valor.');
      }
      if (step.result === 'ajuda') {
        return step.interrupt('help');
      }
      if (step.result === 'trocar') {
        return step.replaceDialog('replacement');
      }
      return step.next(step.result);
    },
    async (step) => {
      await step.context.sendActivity(`Valor aceito: ${step.result}`);
      return step.endDialog(step.result);
    },
  ]));

  const interrupted = conversation();
  await send(dialogs, interrupted, '', { begin: 'main' });
  const helpTurn = await send(dialogs, interrupted, 'ajuda');
  assert.deepEqual(helpTurn.texts, ['Ajuda rápida.', 'Informe o valor.']);
  assert.deepEqual(helpTurn.stack, ['main']);
  assert.equal(interrupted.dialogStack[0].state.stepIndex, 0);

  const resumed = await send(dialogs, interrupted, '42');
  assert.deepEqual(resumed.texts, ['Valor aceito: 42']);
  assert.equal(resumed.result.status, DialogTurnStatus.Complete);

  const replaced = conversation();
  await send(dialogs, replaced, '', { begin: 'main' });
  const replacement = await send(dialogs, replaced, 'trocar');
  assert.deepEqual(replacement.texts, ['Fluxo substituído.']);
  assert.deepEqual(replacement.stack, []);
  assert.equal(replacement.result.result.replaced, true);
});
