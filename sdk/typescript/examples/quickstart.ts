import { CountableClient, InvoicaFullClient } from '../src/index-v2';

const client = new CountableClient({
  apiKey: process.env.INVOICA_API_KEY || 'inv_test_your_key_here',
});

const fullClient = new InvoicaFullClient({
  apiKey: process.env.INVOICA_API_KEY || 'inv_test_your_key_here',
});

async function main() {
  const invoice = await client.createInvoice({
    amount: 1000,
    currency: 'USD',
    recipientAddress: '0x1234567890abcdef1234567890abcdef12345678',
    description: 'Service payment — January 2026',
  });
  console.log('Created invoice:', invoice.id);

  const invoices = await client.listInvoices({ limit: 5 });
  console.log(`Found ${invoices.invoices.length} invoices`);

  const webhook = await fullClient.webhooks.registerWebhook({
    url: 'https://example.com/webhooks/invoica',
    events: ['invoice.created', 'invoice.paid', 'settlement.completed'],
    secret: 'whsec_your_secret_here',
  });
  console.log('Registered webhook:', webhook.id);
}

main().catch(console.error);