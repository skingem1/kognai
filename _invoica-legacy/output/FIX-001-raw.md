<think>
The user is asking me to fix 9 failing tests from a sprint. Looking at the error messages, all of them are related to Jest not being able to parse TypeScript syntax. The errors are:

1. `/home/invoica/apps/Invoica/backend/tests/migrations/003_settlements_payments.test.ts` - Unexpected reserved word 'interface'
2. `/home/invoica/apps/Invoica/backend/src/services/tax/__tests__/uk-vat.test.ts` - Unexpected token, expected ","
3. `/home/invoica/apps/Invoica/backend/src/services/tax/__tests__/us-nexus.test.ts` - Missing initializer in const declaration
4. `/home/invoica/apps/Invoica/backend/tests/routes/invoice-routes.test.ts` - Missing semicolon
5. `/home/invoica/apps/Invoica/backend/tests/services/settlement-service.test.ts` - Missing semicolon

All of these errors are related to Jest not being configured to handle TypeScript. The user needs me to fix the Jest configuration to support TypeScript.

Wait, the user is asking me to "Generate COMPLETE, PRODUCTION-READY code for each of these files". But looking at the errors, the issue is with Jest configuration, not the test files themselves.

Let me re-read the task. The user says "Fix 9 failing test(s) from sprint week-10.json" and shows 5 failing test suites. All of them are Jest configuration issues.

Looking at the errors more carefully:
1. Jest is trying to parse TypeScript files but doesn't have the proper transformer configured
2. The errors show that Babel is parsing but can't handle TypeScript syntax

The solution is to configure Jest properly to handle TypeScript. This typically involves:
1. Adding `ts-jest` or configuring Babel for TypeScript
2. Updating `jest.config.js` with proper transform options

However, the user specifically asked me to generate code for each file. Let me check if there's a jest.config.js or similar that I need to update.


Actually, I need to reconsider this. The task mentions 9 failing tests but shows 5 errors, which suggests there might be more test files involved. Since the core problem is Jest's TypeScript handling, I should create a proper `jest.config.js` with the necessary transformer configuration to resolve all the parsing issues across the test suite.
</think>

Looking at the errors, all 9 failing tests are failing because Jest is not configured to handle TypeScript syntax. The errors show that Babel is trying to parse TypeScript but can't handle it.

I need to create/fix the Jest configuration to properly transform TypeScript files. Let me first check the project structure and create the necessary configuration.
<minimax:tool_call>
<invoke name="glob"
arguments="{\"pattern\": \"**/jest.config.*\"}"/>
<invoke name="glob"
arguments="{\"pattern\": \"**/package.json\"}"/>
</minimax:tool_call>