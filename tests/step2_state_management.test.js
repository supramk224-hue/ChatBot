import assert from 'node:assert/strict';
import test from 'node:test';
import { TurnContext } from '../src/core/TurnContext.js';
import { ConversationState, UserState } from '../src/state/BotState.js';
import { SessionManager } from '../src/state/SessionManager.js';
import { ETagConflictError, MemoryStorage } from '../src/state/StorageAdapter.js';

function contextFor({ userId, conversationId, channelId = 'test' }) {
  return new TurnContext({ userId, conversationId, text: '', channelId });
}

test('MemoryStorage lê, grava e remove documentos clonados', async () => {
  const storage = new MemoryStorage();
  await storage.write({
    'test/conversations/1/': { value: { slots: { subject: 'acesso' } }, eTag: '*' },
  });

  const firstRead = await storage.read(['test/conversations/1/']);
  firstRead['test/conversations/1/'].value.slots.subject = 'mutado-localmente';

  const secondRead = await storage.read(['test/conversations/1/']);
  assert.equal(secondRead['test/conversations/1/'].value.slots.subject, 'acesso');
  assert.ok(secondRead['test/conversations/1/'].eTag);

  await storage.delete(['test/conversations/1/']);
  const afterDelete = await storage.read(['test/conversations/1/']);
  assert.equal(afterDelete['test/conversations/1/'], undefined);
});

test('eTag impede sobrescrita concorrente e aceita a versão atual', async () => {
  const storage = new MemoryStorage();
  await storage.write({ item: { value: { count: 1 }, eTag: '*' } });
  const read = await storage.read(['item']);

  await storage.write({ item: { value: { count: 2 }, eTag: read.item.eTag } });
  const updated = await storage.read(['item']);
  assert.equal(updated.item.value.count, 2);

  await assert.rejects(
    storage.write({ item: { value: { count: 3 }, eTag: read.item.eTag } }),
    ETagConflictError,
  );
  const stable = await storage.read(['item']);
  assert.equal(stable.item.value.count, 2);
});

test('ConversationState e UserState isolam usuários e conversas', async () => {
  const storage = new MemoryStorage();
  const conversationState = new ConversationState(storage);
  const userState = new UserState(storage);
  const conversation = conversationState.createProperty('conversation');
  const profile = userState.createProperty('profile');

  const anaOne = contextFor({ userId: 'ana', conversationId: 'ana-1' });
  const anaTwo = contextFor({ userId: 'ana', conversationId: 'ana-2' });
  const bruno = contextFor({ userId: 'bruno', conversationId: 'bruno-1' });

  await conversation.set(anaOne, { dialogStack: [{ id: 'supportTicket' }], slots: { subject: 'Ana 1' } });
  await conversation.set(anaTwo, { dialogStack: [], slots: { subject: 'Ana 2' } });
  await conversation.set(bruno, { dialogStack: [], slots: { subject: 'Bruno' } });
  await profile.set(anaOne, { name: 'Ana', preferences: { locale: 'pt-BR' }, authenticated: true });
  await profile.set(bruno, { name: 'Bruno', preferences: {}, authenticated: false });

  await conversationState.saveChanges(anaOne);
  await conversationState.saveChanges(anaTwo);
  await conversationState.saveChanges(bruno);
  await userState.saveChanges(anaOne);
  await userState.saveChanges(bruno);

  const anaOneAgain = contextFor({ userId: 'ana', conversationId: 'ana-1' });
  const anaOtherChannel = contextFor({ userId: 'ana', conversationId: 'ana-2' });
  const brunoAgain = contextFor({ userId: 'bruno', conversationId: 'bruno-1' });

  assert.equal((await conversation.get(anaOneAgain)).slots.subject, 'Ana 1');
  assert.equal((await conversation.get(anaOtherChannel)).slots.subject, 'Ana 2');
  assert.equal((await conversation.get(brunoAgain)).slots.subject, 'Bruno');
  assert.equal((await profile.get(anaOtherChannel)).name, 'Ana');
  assert.equal((await profile.get(brunoAgain)).name, 'Bruno');
  assert.equal(conversationState.getStorageKey(anaOne), 'test/conversations/ana-1/');
  assert.equal(userState.getStorageKey(anaOne), 'test/users/ana/');
});

test('saveChanges detecta conflito quando dois turnos partem do mesmo eTag', async () => {
  const storage = new MemoryStorage();
  const conversationState = new ConversationState(storage);
  const accessor = conversationState.createProperty('conversation');
  const first = contextFor({ userId: 'ana', conversationId: 'ana-1' });
  const second = contextFor({ userId: 'ana', conversationId: 'ana-1' });

  await accessor.set(first, { dialogStack: [], slots: {} });
  await conversationState.saveChanges(first);

  await conversationState.load(first, true);
  await conversationState.load(second, true);
  (await accessor.get(first)).slots.subject = 'primeira gravação';
  (await accessor.get(second)).slots.subject = 'segunda gravação';

  await conversationState.saveChanges(first);
  await assert.rejects(conversationState.saveChanges(second), ETagConflictError);

  const check = contextFor({ userId: 'ana', conversationId: 'ana-1' });
  assert.equal((await accessor.get(check)).slots.subject, 'primeira gravação');
});

test('SessionManager expira contexto obsoleto e renova a atividade', () => {
  let now = 5_000;
  const manager = new SessionManager({ ttlMs: 1_000, now: () => now });
  const data = {
    lastActiveAt: 3_000,
    dialogStack: [{ id: 'supportTicket', state: { stepIndex: 2 } }],
    slots: { subject: 'antigo' },
    failureCount: 2,
    conversationHistory: [{ userText: 'oi' }],
  };

  assert.equal(manager.isExpired({ lastActiveAt: null }), false);
  assert.equal(manager.isExpired(data), true);
  manager.expire(data);
  assert.deepEqual(data.dialogStack, []);
  assert.deepEqual(data.slots, {});
  assert.equal(data.failureCount, 0);
  assert.deepEqual(data.conversationHistory, []);

  manager.touch(data);
  assert.equal(data.lastActiveAt, 5_000);
  assert.equal(manager.isExpired(data), false);
});
