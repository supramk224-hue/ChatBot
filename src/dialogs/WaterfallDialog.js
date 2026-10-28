import { randomUUID } from 'node:crypto';
import { messages } from '../core/messages.js';
import { Dialog, DialogReason, DialogTurnStatus, EndOfTurn } from './Dialog.js';

export class WaterfallDialog extends Dialog {
  constructor(id, steps = []) {
    super(id);
    this.steps = [...steps];
  }

  addStep(step) {
    this.steps.push(step);
    return this;
  }

  getVersion() {
    return `${this.id}:${this.steps.length}`;
  }

  async beginDialog(dc, options) {
    const state = dc.activeDialog.state;
    state.stepIndex = 0;
    state.values = { instanceId: randomUUID() };
    state.options = options ?? {};
    state.waitForInput = false;
    state.interruptResume = false;
    return this.runStep(dc, 0, DialogReason.beginCalled);
  }

  async continueDialog(dc) {
    const state = dc.activeDialog.state;
    if (state.waitForInput) {
      state.waitForInput = false;
      return this.runStep(dc, state.stepIndex ?? 0, DialogReason.input, dc.context.activity.text);
    }
    return this.resumeDialog(dc, DialogReason.continueCalled, dc.context.activity.text);
  }

  async resumeDialog(dc, reason, result) {
    const state = dc.activeDialog.state;
    return this.runStep(dc, (state.stepIndex ?? 0) + 1, reason, result);
  }

  async resumeInterrupted(dc) {
    const state = dc.activeDialog.state;
    state.waitForInput = false;
    return this.runStep(dc, state.stepIndex ?? 0, DialogReason.reprompt);
  }

  async goBack(dc) {
    const state = dc.activeDialog.state;
    const current = state.stepIndex ?? 0;
    state.waitForInput = false;
    if (current <= 0) {
      await dc.context.sendActivity(messages.alreadyAtStart);
      return this.runStep(dc, 0, DialogReason.reprompt);
    }
    return this.runStep(dc, current - 1, DialogReason.reprompt);
  }

  async runStep(dc, index, reason, result) {
    if (!dc.activeDialog) {
      return { status: DialogTurnStatus.Complete, result };
    }

    const state = dc.activeDialog.state;
    if (index >= this.steps.length) {
      return dc.endDialog(result);
    }

    state.stepIndex = index;
    let nextCalled = false;
    const step = {
      index,
      options: state.options,
      reason,
      result,
      values: state.values,
      context: dc.context,
      dc,
      activeDialog: dc.activeDialog,
      prompt: async (message) => {
        await dc.context.sendActivity(message);
        state.waitForInput = true;
        return { status: DialogTurnStatus.Waiting };
      },
      next: async (stepResult) => {
        if (nextCalled) {
          throw new Error(`WaterfallStepContext.next(): method already called for dialog and step '${this.id}[${index}]'.`);
        }
        nextCalled = true;
        return this.resumeDialog(dc, DialogReason.nextCalled, stepResult);
      },
      endDialog: (dialogResult) => dc.endDialog(dialogResult),
      beginDialog: (dialogId, dialogOptions) => dc.beginDialog(dialogId, dialogOptions),
      replaceDialog: (dialogId, dialogOptions) => dc.replaceDialog(dialogId, dialogOptions),
      interrupt: (dialogId, dialogOptions) => dc.interrupt(dialogId, dialogOptions),
    };

    const turn = await this.steps[index](step);
    return turn?.status ? turn : EndOfTurn;
  }
}
