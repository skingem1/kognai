const axios = require('axios');
const anthropic = require('anthropic');

// Validate required environment variables
if (!process.env.QWEN_API_KEY) throw new Error('QWEN_API_KEY is required');
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANOTHER_API_KEY is required');

const QWEN_API_URL = process.env.QWEN_API_URL || 'dashscope-intl.aliyuncs.com';

// Define prompts
const prompts = {
  repo_level: "You are a software engineer. Implement a new feature for a web application that allows users to upload and view images. The feature should be in Python using Flask. Write the code with unit tests.",
  debug: "You are a software engineer. Fix the following Python code which has test failures. The code is:\n\n```python
\nfrom flask import Flask\napp = Flask(__name__)\n\n@app.route('/')\ndef home():\n    return 'Hello, World!'\n\nif __name__ == '__main__':\n    app.run()\n```
",
  structured_output: "Generate a JSON schema for a PACT offer that describes a payment system. The schema should include fields for the payment method, amount, currency, and status."
};

// Run tasks for Qwen
async function runQwenTask(prompt) {
  try {
    const response = await axios.post(
      `${QWEN_API_URL}/v1/chat/completions`,
      {
        model: 'qwen-3.6-plus',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1000
      },
      { headers: { 'Authorization': `Bearer ${process.env.QWEN_API_KEY}` } }
    );
    return {
      latency_ms: response.data.created * 1000,
      input_tokens: response.data.usage.input_tokens,
      output_tokens: response.data.usage.output_tokens,
      cost_estimate_usd: (response.data.usage.input_tokens * 0.0001 + 
                         response.data.usage.output_tokens * 0.0002)
    };
  } catch (error) {
    throw new Error(`Qwen error: ${error.message}`);
  }
}

// Run tasks for Claude
async function runClaudeTask(prompt) {
  try {
    const client = new anthropic.Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    const response = await client.chat.completions.create({
      model: 'claude-3-sonnet-20240620',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000
    });
    return {
      latency_ms: response.created_at * 1000,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_estimate_usd: (response.usage.input_tokens * 0.0001 + 
                         response.usage.output_tokens * 0.0002)
    };
  } catch (error) {
    throw new Error(`Claude error: ${error.message}`);
  }
}

// Execute all tasks
const results = {};
for (const [taskName, prompt] of Object.entries(prompts)) {
  try {
    results[taskName] = {
      qwen: await runQwenTask(prompt),
      claude: await runClaudeTask(prompt)
    };
  } catch (error) {
    console.error(`Task ${taskName} failed:`, error);
  }
}

// Calculate monthly cost (2000 sessions)
const monthlyCost = {
  qwen: results.repo_level.qwen.cost_estimate_usd * 2000,
  claude: results.repo_level.claude.cost_estimate_usd * 2000
};

console.log(JSON.stringify({
  tasks: results,
  monthly_cost: monthlyCost
}));