import assert from 'node:assert/strict';
import test from 'node:test';
import { createBotEngine } from '../src/core/BotEngine.js';
import { createEnterpriseRecognizer } from '../src/router/IntentRecognizer.js';

function person(name) {
  return { userId: name, conversationId: `${name}-aurora` };
}

async function say(engine, identity, text) {
  return engine.process({ ...identity, text });
}

function joined(turn) {
  return turn.texts.join('\n');
}

test('frases brasileiras claras não caem no fallback nem empatam à toa', () => {
  const recognizer = createEnterpriseRecognizer();

  const greeting = recognizer.recognize('bom dia, tudo bem?');
  assert.equal(greeting.ambiguous, false);
  assert.equal(greeting.topIntent.name, 'greeting');
  assert.ok(greeting.topIntent.score >= 0.75);

  const invoice = recognizer.recognize('minha fatura veio errada');
  assert.equal(invoice.ambiguous, false);
  assert.equal(invoice.topIntent.name, 'billing');
  assert.ok(invoice.topIntent.score >= 0.75);

  const politeInvoice = recognizer.recognize('Bom dia, minha fatura veio errada');
  assert.equal(politeInvoice.ambiguous, false);
  assert.equal(politeInvoice.topIntent.name, 'billing');

  const ticket = recognizer.recognize('preciso abrir um chamado da cobrança');
  assert.equal(ticket.ambiguous, true);
  assert.ok(ticket.candidates.some((item) => item.name === 'support'));
  assert.ok(ticket.candidates.some((item) => item.name === 'billing'));

  const status = recognizer.recognize('qual o status do meu chamado');
  assert.equal(status.ambiguous, false);
  assert.equal(status.topIntent.name, 'support');
});

test('Lia, da loja Aurora, resolve uma fatura errada com fala natural', async () => {
  const engine = createBotEngine();
  const lia = person('lia');

  const hello = await say(engine, lia, 'Oi, bom dia!');
  assert.match(joined(hello), /Como você gostaria de ser chamado/);
  assert.equal(hello.texts.some((text) => /Não entendi/.test(text)), false);

  const named = await say(engine, lia, 'Me chamo Lia Souza');
  assert.equal(named.profileName, 'Lia Souza');
  assert.match(joined(named), /Olá, Lia Souza/);

  const billing = await say(engine, lia, 'Minha fatura veio com valor errado');
  assert.match(joined(billing), /dúvida de cobrança/i);
  assert.equal(billing.activeDialog, 'billingInquiry');

  const detail = await say(engine, lia, 'Fatura 4481, cobraram duas vezes o mesmo boleto');
  assert.match(joined(detail), /Registrei a sua dúvida de cobrança/);
  assert.equal(detail.slots.billingDetail.includes('4481'), true);
});

test('Rafael desambigua chamado e cobrança em português', async () => {
  const engine = createBotEngine();
  const rafael = person('rafael');

  const tied = await say(engine, rafael, 'Preciso abrir um chamado da cobrança');
  assert.match(joined(tied), /Você quis dizer/);
  assert.match(joined(tied), /chamado/i);
  assert.match(joined(tied), /cobrança/i);
  assert.equal(tied.activeDialog, 'ambiguity');

  const chosen = await say(engine, rafael, 'a de cobrança');
  assert.match(joined(chosen), /dúvida de cobrança/i);
  assert.equal(chosen.activeDialog, 'billingInquiry');

  const single = await say(engine, person('rita'), 'chamado');
  assert.match(joined(single), /Você quis dizer/);
  const first = await say(engine, person('rita'), 'a primeira');
  assert.match(joined(first), /Abrir um chamado/);
});

test('Camila pede uma pessoa e confirma com "pode ser"', async () => {
  const engine = createBotEngine();
  const camila = person('camila');
  await say(engine, camila, 'boa tarde');
  await say(engine, camila, 'Camila');

  const handoff = await say(engine, camila, 'Quero falar com uma pessoa');
  assert.match(joined(handoff), /Cliente: Camila/);
  assert.match(joined(handoff), /Confirma a transferência/);

  const done = await say(engine, camila, 'pode ser');
  assert.match(joined(done), /Protocolo HUM-[A-F0-9]+/);
});

test('Otávio abre chamado falando prioridade, ajuda, cancelamento e consulta', async () => {
  const engine = createBotEngine();
  const otavio = person('otavio');
  await say(engine, otavio, 'olá');
  await say(engine, otavio, 'Otávio');

  const opening = await say(engine, otavio, 'quero abrir um chamado');
  assert.match(joined(opening), /assunto do chamado/);

  await say(engine, otavio, 'Erro no acesso remoto');
  const helped = await say(engine, otavio, 'me ajuda');
  assert.match(helped.texts[0], /Comandos disponíveis/);
  assert.match(helped.texts.at(-1), /Descreva o que aconteceu/);

  await say(engine, otavio, 'O aplicativo fecha depois da senha');
  const priority = await say(engine, otavio, 'prioridade alta');
  assert.match(joined(priority), /Prioridade: alta/);

  const created = await say(engine, otavio, 'pode registrar');
  assert.match(joined(created), /Chamado TCK-[A-F0-9]+ registrado/);
  assert.equal(created.slots.ticket.priority, 'alta');
  const ticketId = created.slots.ticket.id;

  const status = await say(engine, otavio, 'qual o status do meu chamado');
  assert.match(joined(status), new RegExp(ticketId));

  await say(engine, otavio, 'quero abrir um chamado');
  const cancelled = await say(engine, otavio, 'cancela isso');
  assert.match(joined(cancelled), /Fluxo cancelado/);
  assert.equal(cancelled.activeDialog, null);
});
