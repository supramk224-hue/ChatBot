import { randomUUID } from 'node:crypto';

export class TurnContext {
  constructor(activity = {}, { correlationId } = {}) {
    const text = typeof activity.text === 'string'
      ? activity.text
      : activity.text == null
        ? ''
        : JSON.stringify(activity.text);

    this.activity = {
      type: activity.type || 'message',
      channelId: activity.channelId || 'console',
      userId: activity.userId,
      conversationId: activity.conversationId,
      text,
      timestamp: activity.timestamp || new Date().toISOString(),
      locale: activity.locale || 'pt-BR',
      metadata: activity.metadata ? { ...activity.metadata } : {},
    };
    this.correlationId = correlationId || activity.correlationId || randomUUID();
    this.responses = [];
    this.turnState = new Map();
    this.trace = [];
  }

  sendActivity(message) {
    const activity = typeof message === 'string'
      ? { type: 'message', text: message }
      : { type: 'message', ...message };

    if (typeof activity.text !== 'string') {
      throw new TypeError('Activity text must be a string.');
    }

    this.responses.push(activity);
    return activity;
  }
}
