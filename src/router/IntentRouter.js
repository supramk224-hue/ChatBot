import { messages } from '../core/messages.js';

export class IntentRouter {
  constructor({ recognizer, fallback, confidence = 0.75 } = {}) {
    if (!recognizer || !fallback) {
      throw new TypeError('IntentRouter requires a recognizer and a fallback handler.');
    }
    this.recognizer = recognizer;
    this.fallback = fallback;
    this.confidence = confidence;
  }

  async route(dc) {
    const text = dc.context.activity.text || '';
    const interrupt = text ? this.fallback.matchInterrupt(text) : null;
    if (interrupt) {
      return this.handleInterrupt(dc, interrupt);
    }

    if (dc.activeDialog) {
      this.fallback.reset(dc.conversation);
      return dc.continueDialog();
    }

    const recognition = this.recognizer.recognize(text);
    dc.context.turnState.set('recognition', recognition);

    if (recognition.ambiguous) {
      this.fallback.reset(dc.conversation);
      return dc.beginDialog('ambiguity', {
        candidates: recognition.candidates,
        originalText: text,
      });
    }

    if (recognition.topIntent && recognition.topIntent.score >= this.confidence) {
      this.fallback.reset(dc.conversation);
      return dc.beginDialog(recognition.topIntent.dialogId, {
        intent: recognition.topIntent.name,
        entities: recognition.topIntent.entities,
        text,
        category: recognition.topIntent.name,
      });
    }

    const failure = this.fallback.nextFailure(dc.conversation);
    await dc.context.sendActivity(failure.message);
    if (failure.action === 'handoff') {
      return dc.beginDialog('humanHandoff', { reason: 'repeated-failure', text });
    }
    return { status: 'waiting', result: failure };
  }

  async handleInterrupt(dc, interrupt) {
    this.fallback.reset(dc.conversation);

    if (interrupt.name === 'cancel') {
      await dc.cancelAllDialogs();
      await dc.context.sendActivity(messages.cancelled);
      return { status: 'cancelled' };
    }

    if (interrupt.name === 'back') {
      return dc.goBack();
    }

    if (interrupt.name === 'menu') {
      await dc.cancelAllDialogs();
      return dc.beginDialog('mainMenu');
    }

    if (interrupt.name === 'help') {
      return dc.activeDialog ? dc.interrupt('help') : dc.beginDialog('help');
    }

    await dc.cancelAllDialogs();
    return dc.beginDialog('humanHandoff', { reason: 'interrupt' });
  }
}
