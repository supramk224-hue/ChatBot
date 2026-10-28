export function createConversationData() {
  return {
    dialogStack: [],
    slots: {},
    failureCount: 0,
    conversationHistory: [],
    lastActiveAt: null,
  };
}

export function createUserProfile() {
  return {
    name: null,
    preferences: {},
    authenticated: false,
    tickets: [],
  };
}

export class SessionManager {
  constructor({ ttlMs = 30 * 60 * 1000, now = () => Date.now() } = {}) {
    if (ttlMs <= 0) {
      throw new RangeError('ttlMs must be greater than zero.');
    }
    this.ttlMs = ttlMs;
    this.now = now;
  }

  isExpired(conversationData) {
    if (!conversationData?.lastActiveAt) {
      return false;
    }
    return this.now() - conversationData.lastActiveAt > this.ttlMs;
  }

  expire(conversationData) {
    conversationData.dialogStack = [];
    conversationData.slots = {};
    conversationData.failureCount = 0;
    conversationData.conversationHistory = [];
    conversationData.expired = true;
    return conversationData;
  }

  touch(conversationData) {
    conversationData.lastActiveAt = this.now();
    conversationData.expired = false;
    return conversationData;
  }
}
