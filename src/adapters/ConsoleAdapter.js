import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createBotEngine } from '../core/BotEngine.js';
import { normalizeText } from '../core/text.js';
import { ChannelAdapter } from './ChannelAdapter.js';

export class ConsoleAdapter extends ChannelAdapter {
  constructor(engine, { input = process.stdin, output = process.stdout, userId = 'console-user', conversationId = 'console-session' } = {}) {
    super(engine, 'console');
    this.input = input;
    this.output = output;
    this.userId = userId;
    this.conversationId = conversationId;
  }

  start() {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    let closed = false;
    this.output.write('Assistente enterprise pronto. Digite uma mensagem ou "sair" para encerrar.\n');

    const prompt = () => {
      if (!closed) {
        rl.setPrompt('Você> ');
        rl.prompt();
      }
    };

    rl.on('line', (line) => {
      const text = line.trim();
      if (!text) {
        prompt();
        return;
      }
      if (normalizeText(text) === 'sair') {
        closed = true;
        rl.close();
        return;
      }

      rl.pause();
      this.processActivity({ userId: this.userId, conversationId: this.conversationId, text })
        .then((result) => {
          for (const message of result.texts) {
            this.output.write(`Bot> ${message}\n`);
          }
        })
        .catch(() => {
          this.output.write('Bot> Ocorreu um erro ao processar a mensagem.\n');
        })
        .finally(() => {
          rl.resume();
          prompt();
        });
    });

    rl.on('close', () => {
      closed = true;
    });

    prompt();
    return rl;
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url).toLowerCase() === entry.toLowerCase();
}

if (isDirectRun()) {
  const adapter = new ConsoleAdapter(createBotEngine({ logToConsole: false }));
  adapter.start();
}
