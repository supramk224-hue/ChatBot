# Chatbot Enterprise

Esqueleto de um motor conversacional em Node.js, sem dependências externas. O mesmo núcleo atende console, webhook HTTP ou um canal futuro (WhatsApp, webchat, Telegram, Slack).

A arquitetura junta dois modelos de produção:

- **Botkit:** pipeline de middlewares com `next()`, gatilhos `hears` e interrupções globais (`ajuda`, `menu`, `voltar`, `cancelar`, `atendente`) avaliadas antes do diálogo ativo.
- **Microsoft Bot Framework SDK for JavaScript:** `TurnContext` por turno, separação entre `ConversationState` e `UserState`, `MemoryStorage` com `eTag`, e diálogos em cascata (`Waterfall`) sobre uma pilha que pausa o fluxo principal, resolve um subdiálogo e retoma no passo certo.

## Pipeline de um turno

```text
POST /api/messages  ou  console
        |
        v
   TurnContext (userId, conversationId, text, correlationId)
        |
        v
 sanitize --> rate limit --> load state --> sessão/TTL --> rota
        |                                            |
        |                                            +--> interrupção global
        |                                            +--> diálogo ativo (pilha)
        |                                            +--> intenção / desambiguação
        |                                            +--> fallback progressivo
        v
 persistência (eTag) --> log de auditoria com PII mascarado
```

## Árvore de estado e fluxos

```text
UserState
  perfil: nome, preferências, autenticado, chamados

ConversationState
  dialogStack[]
    passo atual, values, slots
  failureCount
  conversationHistory (janela deslizante)
  lastActiveAt (TTL)

onboarding
  └─ pergunta o nome, se ainda não existir
       └─ mainMenu
            ├─ supportTicket
            │    ├─ abrir: assunto → descrição → prioridade → confirmação → protocolo
            │    └─ consultar: lista os chamados do usuário
            ├─ billingInquiry
            ├─ humanHandoff (resumo + confirmação + protocolo HUM)
            └─ help (interrupção que volta ao mesmo passo)
```

A desambiguação olha a frase em português, não só a palavra isolada. "Minha fatura veio errada" segue para cobrança. "Bom dia, minha fatura veio errada" também, porque a saudação não compete com o pedido. "Preciso abrir um chamado da cobrança" pergunta se a pessoa quis dizer chamado ou cobrança, e aceita "1", "a primeira" ou "cobrança". "Quero falar com uma pessoa", "cancela isso" e "pode registrar" entram como fala natural. Os cenários da loja Aurora estão em `tests/step6_portuguese_scenarios.test.js`.

Entrada ambígua, como "chamado" entre suporte e cobrança, abre um subdiálogo de escolha antes de qualquer ação. Operações que gravam chamado ou transferem para um humano pedem confirmação explícita. Três falhas seguidas de validação, ou três mensagens não compreendidas, escalam para o transbordo.

## Testes

```bash
npm test
```

O comando executa a suíte em `tests/` com o test runner nativo do Node.

## Uso

Modo interativo no terminal:

```bash
npm start
```

Digite `sair` para encerrar o console. Dentro da conversa, os comandos são `ajuda`, `menu`, `voltar`, `cancelar` e `falar com atendente`.

Servidor HTTP:

```bash
npm run start:http
```

Por padrão escuta a porta `3000`. `PORT` altera a porta.

```bash
curl http://127.0.0.1:3000/health

curl -X POST http://127.0.0.1:3000/api/messages \
  -H "content-type: application/json" \
  -d "{\"userId\":\"ana\",\"conversationId\":\"ana-1\",\"text\":\"oi\"}"
```

A resposta traz `texts`, `correlationId`, a pilha de diálogos e o estado exposto do turno. O cabeçalho `x-correlation-id` repete o id do turno.

## Novo fluxo

1. Crie um `WaterfallDialog` em `src/flows/`. Cada passo recebe `step` e retorna `step.prompt()`, `step.next()`, `step.beginDialog()`, `step.replaceDialog()` ou `step.endDialog()`.
2. Registre o diálogo em `src/flows/index.js`.
3. Associe a intenção em `createEnterpriseRecognizer()`, com `hears`, palavras-chave e o `dialogId`.
4. Cubra o caminho feliz e uma interrupção em `tests/`.

`step.prompt()` envia a pergunta e permanece no mesmo passo até a resposta. `step.beginDialog()` empilha um subfluxo; quando ele termina, o waterfall segue para o próximo passo com `step.result`. `step.interrupt()` faz o contrário: ao terminar, repete o passo atual. É o mecanismo usado por `ajuda`.

## LLM e canais externos

O reconhecedor de intenções é substituível. Passe outro objeto com `recognize(text)` para `createBotEngine({ recognizer })`. O retorno precisa ter `topIntent` (`name`, `score`, `dialogId`, `label`, `entities`), `ambiguous` e `candidates`. Um adaptador de LLM pode chamar o modelo e devolver esse contrato; o roteador, a desambiguação e os diálogos permanecem os mesmos.

Para um canal novo, estenda `ChannelAdapter` e entregue atividades no formato `{ userId, conversationId, text, channelId }`. `ConsoleAdapter` e `HttpWebhookAdapter` são as referências. O storage também é plugável: implemente `read`, `write` e `delete` com o mesmo `eTag` de `MemoryStorage` para usar Redis, MongoDB ou PostgreSQL sem mudar o motor.

Guardrails já aplicados em todo turno: limite de tamanho, bloqueio de XSS, command injection, prototype pollution e prompt injection, rate limit por usuário e mascaramento de CPF, cartão, e-mail, senha e token nos logs.
