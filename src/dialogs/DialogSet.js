import { DialogContext } from './DialogContext.js';

export class DialogSet {
  constructor() {
    this.dialogs = new Map();
  }

  add(dialog) {
    if (!dialog?.id) {
      throw new TypeError('DialogSet.add requires a dialog with an id.');
    }
    if (this.dialogs.has(dialog.id)) {
      throw new Error(`DialogSet already contains a dialog with id '${dialog.id}'.`);
    }
    this.dialogs.set(dialog.id, dialog);
    return this;
  }

  find(id) {
    return this.dialogs.get(id);
  }

  createContext(turnContext, conversationState) {
    return new DialogContext(this, turnContext, conversationState);
  }
}
