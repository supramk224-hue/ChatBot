import { DialogNotFoundError, DialogTurnStatus } from './Dialog.js';

export class DialogContext {
  constructor(dialogs, context, state) {
    if (!state || typeof state !== 'object') {
      throw new TypeError('DialogContext requires a state object.');
    }
    if (!Array.isArray(state.dialogStack)) {
      state.dialogStack = [];
    }

    this.dialogs = dialogs;
    this.context = context;
    this.stack = state.dialogStack;
    this.conversation = state;
  }

  get activeDialog() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  findDialog(id) {
    const dialog = this.dialogs.find(id);
    if (!dialog) {
      throw new DialogNotFoundError(id);
    }
    return dialog;
  }

  async beginDialog(dialogId, options) {
    const dialog = this.findDialog(dialogId);
    this.stack.push({ id: dialogId, state: {} });
    return dialog.beginDialog(this, options);
  }

  async continueDialog() {
    if (!this.activeDialog) {
      return { status: DialogTurnStatus.Empty };
    }
    return this.findDialog(this.activeDialog.id).continueDialog(this);
  }

  async replaceDialog(dialogId, options) {
    this.stack.pop();
    return this.beginDialog(dialogId, options);
  }

  async interrupt(dialogId, options) {
    if (this.activeDialog) {
      this.activeDialog.state.interruptResume = true;
    }
    return this.beginDialog(dialogId, options);
  }

  async endDialog(result) {
    this.stack.pop();
    if (this.activeDialog?.state?.interruptResume) {
      this.activeDialog.state.interruptResume = false;
      const parent = this.findDialog(this.activeDialog.id);
      if (typeof parent.resumeInterrupted === 'function') {
        return parent.resumeInterrupted(this);
      }
      return parent.resumeDialog(this, 'endCalled', result);
    }

    if (this.activeDialog) {
      return this.findDialog(this.activeDialog.id).resumeDialog(this, 'endCalled', result);
    }

    return { status: DialogTurnStatus.Complete, result };
  }

  async cancelAllDialogs() {
    const hadDialogs = this.stack.length > 0;
    this.stack.length = 0;
    return { status: hadDialogs ? DialogTurnStatus.Cancelled : DialogTurnStatus.Empty };
  }

  async goBack() {
    if (!this.activeDialog) {
      return this.beginDialog('mainMenu');
    }
    const dialog = this.findDialog(this.activeDialog.id);
    if (typeof dialog.goBack !== 'function') {
      await this.context.sendActivity('Não há um passo anterior neste fluxo.');
      return { status: DialogTurnStatus.Waiting };
    }
    return dialog.goBack(this);
  }
}
