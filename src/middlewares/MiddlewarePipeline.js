export class MiddlewarePipeline {
  constructor() {
    this.middlewares = [];
  }

  use(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function.');
    }
    this.middlewares.push(fn);
    return this;
  }

  async run(context) {
    const dispatch = async (index) => {
      const fn = this.middlewares[index];
      if (!fn) {
        return;
      }

      let continued = false;
      await fn(context, async () => {
        if (continued) {
          throw new Error('next() called multiple times in the same middleware.');
        }
        continued = true;
        await dispatch(index + 1);
      });
    };

    await dispatch(0);
  }
}
