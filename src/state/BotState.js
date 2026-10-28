import { StatePropertyAccessor } from './StatePropertyAccessor.js';

export function calculateChangeHash(state) {
  return JSON.stringify(state ?? {});
}

export class BotState {
  constructor(storage, storageKeyFactory, namespace) {
    if (!storage) {
      throw new TypeError('BotState requires a storage provider.');
    }
    this.storage = storage;
    this.storageKeyFactory = storageKeyFactory;
    this.namespace = namespace;
    this.cacheKey = Symbol(namespace);
  }

  createProperty(name) {
    return new StatePropertyAccessor(this, name);
  }

  async load(context, force = false) {
    const cached = context.turnState.get(this.cacheKey);
    if (!force && cached) {
      return cached.state;
    }

    const key = this.storageKeyFactory(context);
    if (!key) {
      throw new Error(`${this.namespace}: storage key was not returned.`);
    }

    const items = await this.storage.read([key]);
    const stored = items[key];
    const state = stored ? stored.value : {};
    context.turnState.set(this.cacheKey, {
      state,
      hash: calculateChangeHash(state),
      eTag: stored?.eTag || '*',
      storageKey: key,
    });
    return state;
  }

  get(context) {
    const cached = context.turnState.get(this.cacheKey);
    return cached ? cached.state : undefined;
  }

  async saveChanges(context, force = false) {
    let cached = context.turnState.get(this.cacheKey);
    if (!cached && force) {
      const key = this.storageKeyFactory(context);
      cached = { state: {}, hash: '', eTag: '*', storageKey: key };
      context.turnState.set(this.cacheKey, cached);
    }

    if (!cached) {
      return;
    }

    const hash = calculateChangeHash(cached.state);
    if (!force && hash === cached.hash) {
      return;
    }

    await this.storage.write({
      [cached.storageKey]: { value: cached.state, eTag: cached.eTag },
    });
    const refreshed = await this.storage.read([cached.storageKey]);
    cached.eTag = refreshed[cached.storageKey].eTag;
    cached.hash = calculateChangeHash(cached.state);
  }

  async clear(context) {
    const key = this.storageKeyFactory(context);
    context.turnState.set(this.cacheKey, {
      state: {},
      hash: '',
      eTag: context.turnState.get(this.cacheKey)?.eTag || '*',
      storageKey: key,
    });
  }

  async delete(context) {
    const key = this.storageKeyFactory(context);
    context.turnState.delete(this.cacheKey);
    await this.storage.delete([key]);
  }
}

function requirePart(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

export class ConversationState extends BotState {
  constructor(storage, namespace = '') {
    const storageKey = (context) => {
      const channelId = requirePart(context.activity?.channelId, 'missing activity.channelId');
      const conversationId = requirePart(context.activity?.conversationId, 'missing activity.conversation.id');
      return `${channelId}/conversations/${conversationId}/${namespace}`;
    };
    super(storage, storageKey, 'ConversationState');
    this.namespace = namespace;
    this.storageKey = storageKey;
  }

  getStorageKey(context) {
    return this.storageKey(context);
  }
}

export class UserState extends BotState {
  constructor(storage, namespace = '') {
    const storageKey = (context) => {
      const channelId = requirePart(context.activity?.channelId, 'missing activity.channelId');
      const userId = requirePart(context.activity?.userId, 'missing activity.userId');
      return `${channelId}/users/${userId}/${namespace}`;
    };
    super(storage, storageKey, 'UserState');
    this.namespace = namespace;
    this.storageKey = storageKey;
  }

  getStorageKey(context) {
    return this.storageKey(context);
  }
}
