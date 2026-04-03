def run_qwen_task():
    # Task 1: Implement a new feature in a codebase with 10,000 tokens
    prompt = "You are a software engineer working on a codebase that has approximately 10,000 tokens of code. Implement a new feature that allows users to upload and view images. The feature should be in Python using Flask. Write the code with unit tests."
    response = "from flask import Flask\n\napp = Flask(__name__)\n\n@app.route('/upload')\ndef upload_image():\n    return 'Image uploaded successfully'\n\nif __name__ == '__main__':\n    app.run()"
    # Calculate cost with correct rates: $0.29 per million input tokens, $1.65 per million output tokens
    input_tokens = 1200
    output_tokens = 850
    cost_estimate_usd = (input_tokens * 0.29 + output_tokens * 1.65) / 1000000
    return {
        "prompt": prompt,
        "response": response,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_estimate_usd": cost_estimate_usd
    }

def run_claude_task():
    # Task 2: Fix test failures in a Python application
    prompt = "You are a software engineer. Fix the following Python code which has test failures. The code is:\n\n```python
\nfrom flask import Flask\napp = Flask(__name__)\n\n@app.route('/')\ndef home():\n    return 'Hello, World!'\n\nif __name__ == '__main__':\n    app.run()\n```
\n"
    response = "from flask import Flask\n\napp = Flask(__name__)\n\n@app.route('/')\ndef home():\n    return 'Hello, World!'\n\nif __name__ == '__main__':\n    app.run()\n\n# Added test failure fix\nimport unittest\n\nclass TestApp(unittest.TestCase):\n    def test_home(self):\n        self.assertEqual(home(), 'Hello, World!')"
    # Calculate cost with correct rates
    input_tokens = 1500
    output_tokens = 1200
    cost_estimate_usd = (input_tokens * 0.29 + output_tokens * 1.65) / 1000000
    return {
        "prompt": prompt,
        "response": response,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_estimate_usd": cost_estimate_usd
    }

def run_pact_task():
    # Task 3: Generate JSON schema for payment system
    prompt = "Generate a JSON schema for a PACT offer that describes a payment system. The schema should include fields for the payment method, amount, currency, and status."
    response = '{"type": "object", "properties": {"payment_method": {"type": "string"}, "amount": {"type": "number"}, "currency": {"type": "string"}, "status": {"type": "string"}}}'
    # Calculate cost with correct rates
    input_tokens = 900
    output_tokens = 650
    cost_estimate_usd = (input_tokens * 0.29 + output_tokens * 1.65) / 1000000
    return {
        "prompt": prompt,
        "response": response,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_estimate_usd": cost_estimate_usd
    }

# Run all tasks
if __name__ == "__main__":
    results = [
        run_qwen_task(),
        run_claude_task(),
        run_pact_task()
    ]
    for result in results:
        print(f"Task: {result['prompt'][:50]}...")
        print(f"Cost: ${result['cost_estimate_usd']:.6f}")
        print(f"Tokens: {result['input_tokens']} input, {result['output_tokens']} output\n")