export default function SupportPage() {
  const contacts = [
    { label: 'Email', value: 'support@invoica.dev', icon: '📧' },
    { label: 'Discord', value: 'discord.gg/invoica', icon: '💬' },
    { label: 'Status', value: 'status.invoica.dev', icon: '🟢' },
  ];

  const faqs = [
    { question: 'How do I get an API key?', answer: 'Go to Dashboard > API Keys and click Create New Key' },
    { question: 'What chains are supported?', answer: 'Base, Ethereum, and Polygon for settlements' },
    { question: 'How do webhooks work?', answer: 'Register a URL and we will POST events to it in real-time' },
    { question: 'Is there a rate limit?', answer: '100 requests per minute per API key on the free plan' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="text-gray-600 mt-1">Get help with your account and API</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">All Systems Operational</span>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Contact</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {contacts.map((c) => (
            <div key={c.label} className="border rounded-lg p-4">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="font-medium">{c.label}</div>
              <div className="text-gray-600">{c.value}</div>
            </div>
          ))}
        </div>
      </section>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                                      <h3 className="font-semibold text-blue-900">💬 Live Support on Telegram</h3>
                                                  <p className="text-blue-700 text-sm mt-1">Chat with our AI support bot — instant answers, 24/7</p>
                                                            </div>
                                                                      <a
                                                                                  href="https://t.me/invoicaBot"
                                                                                              target="_blank"
                                                                                                          rel="noopener noreferrer"
                                                                                                                      className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                                                                                                                                >
                                                                                                                                            Open Telegram Bot
                                                                                                                                                      </a>
                                                                                                                                                              </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">FAQ</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="font-medium">{faq.question}</div>
              <div className="text-gray-600 mt-1">{faq.answer}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}