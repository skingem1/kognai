import https from 'https';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';

const SYSTEM_PROMPT = `You are Invoica's friendly customer support assistant. Invoica is a Financial OS for AI Agents - an x402 invoice middleware platform that enables autonomous AI agents to send and receive payments seamlessly.

Key features:
- Automated invoicing and payment tracking
- Tax calculation for 15+ countries (EU, UK, US)
- Webhook notifications for payment events
- Sandbox environment for testing
- REST API with TypeScript SDK

Pricing:
- Free: 100 invoices/month, basic features, sandbox environment
- Pro ($49/month): 10,000 invoices/month, multi-jurisdiction tax, priority support, advanced analytics

Dashboard & API Keys: https://invoica.wp1.host

Be concise, helpful, and friendly. For complex issues, direct users to the documentation.`;

const conversationHistory = new Map<number, Message[]>();

function httpsPost(hostname: string, path: string, headers: Record<string, string>, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function telegramSend(method: string, params: object): Promise<any> {
  const body = JSON.stringify(params);
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/${method}`, { 'Content-Type': 'application/json' }, body);
}

async function callMiniMax(messages: Message[]): Promise<string> {
  const body = JSON.stringify({
    model: 'MiniMax-Text-01',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.7,
    max_tokens: 600,
  });
  const response = await httpsPost(
    'api.minimax.chat',
    `/v1/text/chatcompletion_v2?GroupId=${MINIMAX_GROUP_ID}`,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${MINIMAX_API_KEY}` },
    body
  );
  return response?.choices?.[0]?.message?.content || 'Sorry, I could not process your request right now. Please try again.';
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (!update.message?.text) return;
  const { chat, from, text } = update.message;
  const chatId = chat.id;
  const userId = from.id;

  if (text === '/start') {
    await telegramSend('sendMessage', {
      chat_id: chatId,
      text: `👋 Welcome to Invoica Support, ${from.first_name}!\n\nI can help you with:\n• API integration & usage\n• Pricing & billing questions\n• Feature explanations\n• Technical troubleshooting\n\nHow can I help you today?`,
    });
    return;
  }

  if (text === '/pricing') {
    await telegramSend('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `💰 *Invoica Pricing*\n\n🆓 *Free Plan*\n• 100 invoices/month\n• Basic tax calculation\n• Webhook notifications\n• Sandbox environment\n• Community support\n\n⚡ *Pro - $49/month*\n• 10,000 invoices/month\n• Multi-jurisdiction tax (15+ countries)\n• Budget enforcement\n• Priority webhook delivery\n• Email support\n• Advanced analytics\n\nGet started: https://invoica.wp1.host`,
    });
    return;
  }

  if (text === '/docs') {
    await telegramSend('sendMessage', {
      chat_id: chatId,
      text: `📖 Documentation: https://invoica.wp1.host\n🔑 API Keys: https://invoica.wp1.host/api-keys`,
    });
    return;
  }

  if (text === '/help') {
    await telegramSend('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `📚 *Available Commands*\n\n/start - Welcome message\n/pricing - View plans & pricing\n/docs - API documentation\n/help - This menu\n\nOr just ask me anything about Invoica!`,
    });
    return;
  }

  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  const history = conversationHistory.get(userId)!;
  history.push({ role: 'user', content: text });
  if (history.length > 10) history.splice(0, history.length - 10);

  await telegramSend('sendChatAction', { chat_id: chatId, action: 'typing' });

  try {
    const reply = await callMiniMax(history);
    history.push({ role: 'assistant', content: reply });
    await telegramSend('sendMessage', { chat_id: chatId, text: reply });
  } catch (err) {
    console.error('[CustomerBot] MiniMax error:', err);
    await telegramSend('sendMessage', { chat_id: chatId, text: 'Sorry, I am having trouble connecting right now. Please try again in a moment.' });
  }
}

export async function startCustomerBot(): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.log('[CustomerBot] TELEGRAM_BOT_TOKEN not set — skipping');
    return;
  }
  console.log('[CustomerBot] Starting Invoica customer support bot...');

  let offset = 0;
  const poll = async (): Promise<void> => {
    try {
      const result = await httpsGet('api.telegram.org', `/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=25`);
      if (result?.ok && Array.isArray(result.result)) {
        for (const update of result.result as TelegramUpdate[]) {
          offset = update.update_id + 1;
          handleUpdate(update).catch((e) => console.error('[CustomerBot] Handler error:', e));
        }
      }
    } catch (err) {
      console.error('[CustomerBot] Polling error:', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
    setImmediate(poll);
  };
  poll();
  console.log('[CustomerBot] Customer support bot running!');
}
