export const DialogTurnStatus = {
  Empty: 'empty',
  Waiting: 'waiting',
  Complete: 'complete',
  Cancelled: 'cancelled',
};

export const DialogReason = {
  beginCalled: 'beginCalled',
  continueCalled: 'continueCalled',
  nextCalled: 'nextCalled',
  endCalled: 'endCalled',
  replaceCalled: 'replaceCalled',
  reprompt: 'reprompt',
  input: 'input',
};

export const EndOfTurn = Object.freeze({ status: DialogTurnStatus.Waiting });

export function turnResult(status, result) {
  return { status, result };
}

export class DialogNotFoundError extends Error {
  constructor(id) {
    super(`DialogContext.beginDialog(): A dialog with an id of '${id}' wasn't found.`);
    this.name = 'DialogNotFoundError';
    this.dialogId = id;
  }
}

export class Dialog {
  constructor(id) {
    if (!id) {
      throw new TypeError('Dialog id is required.');
    }
    this.id = id;
  }

  async beginDialog(dc) {
    return dc.endDialog();
  }

  async continueDialog(dc) {
    return dc.endDialog();
  }

  async resumeDialog(dc, reason, result) {
    return dc.endDialog(result);
  }
}
