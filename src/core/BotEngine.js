import { messages } from './messages.js';
import { TurnContext } from './TurnContext.js';
import { MiddlewarePipeline } from '../middlewares/MiddlewarePipeline.js';
import { DialogSet } from '../dialogs/DialogSet.js';
import { registerEnterpriseDialogs } from '../flows/index.js';
import { IntentRouter } from '../router/IntentRouter.js';
import { FallbackHandler } from '../router/FallbackHandler.js';
import { createEnterpriseRecognizer } from '../router/IntentRecognizer.js';
import { Logger } from '../security/logger.js';
import { RateLimiter } from '../security/rateLimiter.js';
import { sanitizeInput } from '../security/inputSanitizer.js';
import { ConversationState, UserState } from '../state/BotState.js';
import { createConversationData, createUserProfile, SessionManager } from '../state/SessionManager.js';
import { MemoryStorage } from '../state/StorageAdapter.js';

const TRACE = ['sanitize', 'rateLimit', 'loadState', 'session', 'route', 'persist', 'audit'];

export class BotEngine {
  constructor({
    storage = new MemoryStorage(),
    conversationState = new ConversationState(storage),
    userState = new UserState(storage),
    sessionManager,
    rateLimiter,
    logger = new Logger(),
    recognizer = createEnterpriseRecognizer(),
    dialogs = new DialogSet(),
    router,
    now = () => Date.now(),
    historySize = 10,
    maxMessageLength = 2000,
  } = {}) {
    this.conversationState = conversationState;
    this.userState = userState;
    this.conversationAccessor = conversationState.createProperty('conversation');
    this.userAccessor = userState.createProperty('profile');
    this.sessionManager = sessionManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.recognizer = recognizer;
    this.dialogs = dialogs;
    this.router = router ?? new IntentRouter({ recognizer, fallback: new FallbackHandler() });
    this.now = now;
    this.historySize = historySize;
    this.maxMessageLength = maxMessageLength;
    this.pipeline = this.createPipeline();
  }

  createPipeline() {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (context, next) => {
      context.trace.push('sanitize');
      const result = sanitizeInput(context.activity.text, {
        maxLength: this.maxMessageLength,
        metadata: context.activity.metadata,
      });
      if (result.blocked) {
        context.turnState.set('blocked', { violations: result.violations });
      } else {
        context.activity.text = result.text;
      }
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('rateLimit');
      const key = context.activity.userId || context.activity.conversationId;
      const decision = this.rateLimiter.check(key);
      if (!decision.allowed) {
        context.turnState.set('rateLimited', decision);
      }
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('loadState');
      await this.conversationState.load(context);
      await this.userState.load(context);
      const conversation = await this.conversationAccessor.get(context, createConversationData);
      const profile = await this.userAccessor.get(context, createUserProfile);
      context.turnState.set('conversationData', conversation);
      context.turnState.set('userProfile', profile);
      context.turnState.set('recognizer', this.recognizer);
      context.turnState.set('loaded', true);
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('session');
      const skipped = context.turnState.get('blocked') || context.turnState.get('rateLimited');
      if (!skipped) {
        const conversation = context.turnState.get('conversationData');
        if (this.sessionManager.isExpired(conversation)) {
          this.sessionManager.expire(conversation);
          context.turnState.set('sessionExpired', true);
          await context.sendActivity(messages.sessionExpired);
        }
        this.sessionManager.touch(conversation);
      }
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('route');
      await this.handleTurn(context);
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('persist');
      if (context.turnState.get('loaded')) {
        await this.conversationState.saveChanges(context);
        await this.userState.saveChanges(context);
      }
      await next();
    });
    pipeline.use(async (context, next) => {
      context.trace.push('audit');
      this.logger.info('turn', {
        correlationId: context.correlationId,
        userId: context.activity.userId,
        conversationId: context.activity.conversationId,
        channelId: context.activity.channelId,
        text: context.activity.text,
        responseCount: context.responses.length,
        blocked: Boolean(context.turnState.get('blocked')),
        rateLimited: Boolean(context.turnState.get('rateLimited')),
      });
      await next();
    });
    return pipeline;
  }

  async process(activity) {
    if (!activity?.userId || !activity?.conversationId) {
      throw new TypeError('userId and conversationId are required.');
    }
    const context = new TurnContext(activity);
    await this.pipeline.run(context);
    return this.toResult(context);
  }

  async handleTurn(context) {
    const blocked = context.turnState.get('blocked');
    if (blocked) {
      const onlyLength = blocked.violations.length === 1 && blocked.violations[0] === 'max-length';
      await context.sendActivity(onlyLength ? messages.tooLong : messages.blocked);
      return;
    }
    if (context.turnState.get('rateLimited')) {
      await context.sendActivity(messages.rateLimited);
      return;
    }

    const conversation = context.turnState.get('conversationData');
    const dc = this.dialogs.createContext(context, conversation);
    await this.router.route(dc);
    this.appendHistory(context, conversation);
  }

  appendHistory(context, conversation) {
    conversation.conversationHistory.push({
      correlationId: context.correlationId,
      at: new Date(this.now()).toISOString(),
      userText: context.activity.text,
      botTexts: context.responses.map((item) => item.text),
    });
    const overflow = conversation.conversationHistory.length - this.historySize;
    if (overflow > 0) {
      conversation.conversationHistory.splice(0, overflow);
    }
  }

  toResult(context) {
    const conversation = context.turnState.get('conversationData');
    const profile = context.turnState.get('userProfile');
    const stack = conversation?.dialogStack || [];
    return {
      correlationId: context.correlationId,
      responses: context.responses,
      texts: context.responses.map((item) => item.text),
      blocked: context.turnState.get('blocked') || null,
      rateLimited: Boolean(context.turnState.get('rateLimited')),
      sessionExpired: Boolean(context.turnState.get('sessionExpired')),
      trace: [...context.trace],
      dialogStack: stack.map((item) => item.id),
      activeDialog: stack.at(-1)?.id ?? null,
      failureCount: conversation?.failureCount || 0,
      historyLength: conversation?.conversationHistory?.length || 0,
      profileName: profile?.name || null,
      slots: conversation?.slots || {},
    };
  }
}

export function createBotEngine(options = {}) {
  const now = options.now ?? (() => Date.now());
  const storage = options.storage ?? new MemoryStorage();
  const dialogs = new DialogSet();
  registerEnterpriseDialogs(dialogs);
  const recognizer = options.recognizer ?? createEnterpriseRecognizer();

  return new BotEngine({
    storage,
    conversationState: new ConversationState(storage),
    userState: new UserState(storage),
    sessionManager: new SessionManager({ ttlMs: options.ttlMs ?? 30 * 60 * 1000, now }),
    rateLimiter: options.rateLimiter ?? new RateLimiter({
      windowMs: options.rateLimit?.windowMs ?? 60_000,
      maxRequests: options.rateLimit?.maxRequests ?? 30,
      now,
    }),
    logger: options.logger ?? new Logger({ writeToConsole: options.logToConsole ?? false }),
    recognizer,
    dialogs,
    now,
    historySize: options.historySize ?? 10,
    maxMessageLength: options.maxMessageLength ?? 2000,
  });
}

export { TRACE as pipelineTrace };
