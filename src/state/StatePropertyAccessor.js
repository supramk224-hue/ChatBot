export class StatePropertyAccessor {
  constructor(botState, name) {
    if (!name) {
      throw new TypeError('State property name is required.');
    }
    this.botState = botState;
    this.name = name;
  }

  async get(context, defaultValue) {
    await this.botState.load(context);
    const state = this.botState.get(context);
    if (state[this.name] === undefined && defaultValue !== undefined) {
      state[this.name] = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    }
    return state[this.name];
  }

  async set(context, value) {
    await this.botState.load(context);
    this.botState.get(context)[this.name] = value;
  }

  async delete(context) {
    await this.botState.load(context);
    delete this.botState.get(context)[this.name];
  }
}
