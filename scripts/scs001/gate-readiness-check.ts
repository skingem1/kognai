We are creating a new TypeScript file: scripts/scs001/gate-readiness-check.ts
 The task context says: 
   - posting-health.json exists at reports/posting-health.json with gate progress (14/30 posts, 13 days left)
   - gate-readiness-final.ts is a comprehensive 250-line report for the final 2 days before Apr 7 (this is a different purpose)

 This is a lightweight daily check script that operators can run any time.

 We are to write a production-ready TypeScript file that:
   - Checks the gate readiness status (based on the posting-health.json)
   - The file should be lightweight (so not too heavy) and run daily.

 Steps:
   1. We assume the file `reports/posting-health.json` exists and contains the gate progress.
   2. We'll read that JSON file and check the current progress and days left.
   3. We'll output a simple report that shows:
        - Current posts completed (out of 30)
        - Days left until the gate (or until Apr 7? The context says "13 days left" but note: the gate-readiness-final.ts is for the last 2 days before Apr 7)

 However, note: the task says "This is a lightweight daily check script". So we don't need to be too complex.

 Important: The file must be in the path: scripts/scs001/gate-readiness-check.ts

 We are to write the file without any explanatory text, just the raw content.

 Let's design:

   - We'll use `fs` to read the JSON file.
   - We'll parse the JSON and then output a simple report.

 But note: the context says that the file `reports/posting-health.json` has the gate progress (14/30 posts, 13 days left). So we assume the JSON has at least:
        { "posts_completed": 14, "total_posts": 30, "days_left": 13 }

 However, the problem says: "posting-health.json exists at reports/posting-health.json"

 We'll write a script that:
   - Reads `reports/posting-health.json`
   - If the file doesn't exist, we output an error (but the task says it exists, so we assume it does)
   - Then we compute the progress and days left.

 But note: the task says it's a lightweight daily check. So we don't need to do heavy processing.

 We'll output a string that shows:
        "Gate Readiness Check (Daily)"
        "Posts Completed: 14 out of 30"
        "Days Left: 13"

 However, the problem says: "Different purpose from gate-readiness-final.ts". So we are not doing the same as the 250-line report.

 We are to write a script that operators can run any time. So it's a command-line script.

 Steps in code:

   1. Import `fs` and `path` (for path handling)
   2. Define the path to the health file: `path.join(__dirname, 'reports', 'posting-health.json')`
   3. Read the file and parse JSON.
   4. Check if the JSON has the expected fields (if not, we might output an error or use defaults? But the task says it exists with the given data)
   5. Print a simple report.

 But note: the problem says "lightweight", so we don't want to do too much.

 However, the problem also says: "This is a lightweight daily check script operators can run any time". So we can output to console.

 We'll write:

   - A function to read the health file and then print the report.

 But note: the file is for operators to run, so we don't want to be too verbose.

 Let's write the code:

   We'll do:

      const fs = require('fs');
      const path = require('path');

      const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

      try {
          const data = fs.readFileSync(healthFilePath, 'utf8');
          const health = JSON.parse(data);

          // Check if we have the required fields
          if (health.posts_completed === undefined || health.total_posts === undefined || health.days_left === undefined) {
              throw new Error('Health file is missing required fields');
          }

          console.log(`Gate Readiness Check (Daily)`);
          console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
          console.log(`Days Left: ${health.days_left}`);
      } catch (error) {
          console.error(`Error in gate-readiness-check: ${error.message}`);
          process.exit(1);
      }

 However, note: the problem says "production quality, no TODOs or placeholders". So we write it as above.

 But wait: the problem says "This is a lightweight daily check script". We don't want to do too much. Also, the problem says "operators can run any time", so we don't want to require the file to be present? But the task says it exists.

 However, the problem says: "posting-health.json exists at reports/posting-health.json", so we assume it's there.

 But note: the problem says "Different purpose from gate-readiness-final.ts". So we are not doing the same as the 250-line report.

 We are writing a simple check.

 Let's write the file in TypeScript (ESM) as per the rules.

 Important: The system prompt says for TypeScript: use strict types, no `any` unless explicitly required, ESM imports.

 So we'll write:

   - We use `import` for `fs` and `path` (ESM)
   - We don't use `require` because it's ESM.

 However, note: the problem says "TypeScript", so we write in TypeScript.

 But the problem also says: "For .sh/.bash scripts, start with #!/bin/bash" — but this is a TypeScript file, so we don't do that.

 Steps for the file:

   - We'll write the file as a TypeScript module that runs when executed (so we use `if (require.main === module)` to run the script? But the problem says it's a script that operators run, so we want it to be a command-line script.

   Alternatively, we can write it as a script that runs in the console.

   Since it's a script, we can do:

        if (require.main === module) {
            // run the script
        }

   But note: the problem says "lightweight", so we don't want to be too heavy.

   However, the problem says: "production quality".

   Let's write:

        import path from 'path';
        import fs from 'fs';

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health = JSON.parse(data);

            // Check for required fields
            if (typeof health.posts_completed !== 'number' || typeof health.total_posts !== 'number' || typeof health.days_left !== 'number') {
                throw new Error('Health file has invalid data types');
            }

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   But note: the problem says "no placeholders", so we don't have any.

   However, the problem says: "Include all imports, types, error handling".

   We'll write the file with the above.

   But wait: the problem says "This is a NEW file — create it from scratch". So we don't have any existing code.

   Also, note: the problem says "Do NOT wrap output in markdown code fences". So we output the raw content.

   We'll write the file as:

        FILE: scripts/scs001/gate-readiness-check.ts

        [content]

   Let's write the content.

   Important: The problem says "TypeScript": use strict types, no `any` unless explicitly required.

   We are using `number` for the fields.

   We'll add a type for the health object? But the problem says lightweight, so we don't want to be too strict. However, we are in TypeScript.

   Alternatively, we can define an interface for the health data? But the problem says lightweight.

   Since the problem says "lightweight", we'll do minimal typing.

   However, the problem says: "production quality". So we'll do:

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

   But note: the problem says "lightweight", so we might skip the interface? But it's a good practice.

   Let's do:

        We'll define the interface to be safe.

   Alternatively, we can do without the interface and just check the types in the catch? But the problem says production quality.

   I think we should define the interface.

   Steps:

        import path from 'path';
        import fs from 'fs';

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health: HealthData = JSON.parse(data);

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   But note: the problem says "lightweight", so we don't want to be too heavy. However, the interface is minimal.

   Also, the problem says: "Include all imports, types, error handling".

   We have the imports and error handling.

   However, the problem says: "Do NOT wrap output in markdown code fences". So we output the raw string.

   Let's write the file content.

   One more thing: the problem says "No explanatory text — output file content only". So we don't have any extra text.

   We'll output:

        FILE: scripts/scs001/gate-readiness-check.ts

        [the content above]

   But note: the problem says "For .sh/.bash scripts, start with #!/bin/bash" — but this is a TypeScript file, so we don't do that.

   We are writing a TypeScript file, so we don't have a shebang.

   However, the problem says: "TypeScript: use strict types, no `any` unless explicitly required, ESM imports".

   We are using ESM imports.

   Let's write the file.

   Important: The problem says "production quality, no TODOs or placeholders". So we don't have any.

   We'll write the file as:

        import path from 'path';
        import fs from 'fs';

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health: HealthData = JSON.parse(data);

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   But note: the problem says "lightweight", so we don't want to do too much. This is minimal.

   However, the problem says "operators can run any time", so we want it to be robust.

   We'll output this.

   One more thing: the problem says "Different purpose from gate-readiness-final.ts". So we are not doing the same as the 250-line report. This is a simple check.

   We are good.

   Let's write the output.

   Note: the problem says "Do NOT wrap output in markdown code fences". So we output the raw string.

   We'll write:

        FILE: scripts/scs001/gate-readiness-check.ts

        import path from 'path';
        import fs from 'fs';

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health: HealthData = JSON.parse(data);

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   But note: the problem says "TypeScript", so we don't have a shebang.

   This should be the content.

   However, the problem says: "This is a lightweight daily check script". We are doing a simple check.

   We'll output this.

   But wait: the problem says "production quality". We are using `process.exit(1)` for errors, which is good.

   Also, we are using `console.log` for the report.

   We are good.

   Let's write the output.

   Note: the problem says "Do NOT wrap output in markdown code fences". So we output the string as is.

   We'll output:

        FILE: scripts/scs001/gate-readiness-check.ts

        import path from 'path';
        import fs from 'fs';

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health: HealthData = JSON.parse(data);

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   But note: the problem says "lightweight", so we don't want to do too much. This is minimal.

   However, the problem says "production quality", so we have the error handling.

   We are good.

   Let's output.

   One more thing: the problem says "TypeScript: use strict types". We are using `number` and `interface`, so it's strict.

   We are good.

   Final output.

   Note: the problem says "This is a NEW file — create it from scratch". So we don't have any existing code.

   We write the above.

   But note: the problem says "Do NOT wrap output in markdown code fences". So we output the string without any markdown.

   We'll write:

        FILE: scripts/scs001/gate-readiness-check.ts

        import path from 'path';
        import fs from 'fs';

        interface HealthData {
            posts_completed: number;
            total_posts: number;
            days_left: number;
        }

        const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

        try {
            const data = fs.readFileSync(healthFilePath, 'utf8');
            const health: HealthData = JSON.parse(data);

            console.log(`Gate Readiness Check (Daily)`);
            console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
            console.log(`Days Left: ${health.days_left}`);
        } catch (error) {
            console.error(`Error in gate-readiness-check: ${error.message}`);
            process.exit(1);
        }

   However, the problem says "lightweight", so we might not want to define the interface? But it's a good practice and the problem says production quality.

   Alternatively, we can skip the interface and do:

        const health = JSON.parse(data);

        if (typeof health.posts_completed !== 'number' || ...) 

   But the problem says production quality, so we do the interface.

   We'll go with the interface.

   Let's output.

   Note: the problem says "no `any` unless explicitly required". We don't have any `any`.

   We are good.

   Final answer.
</think>

FILE: scripts/scs001/gate-readiness-check.ts

import path from 'path';
import fs from 'fs';

interface HealthData {
  posts_completed: number;
  total_posts: number;
  days_left: number;
}

const healthFilePath = path.join(__dirname, 'reports', 'posting-health.json');

try {
  const data = fs.readFileSync(healthFilePath, 'utf8');
  const health: HealthData = JSON.parse(data);

  console.log('Gate Readiness Check (Daily)');
  console.log(`Posts Completed: ${health.posts_completed} out of ${health.total_posts}`);
  console.log(`Days Left: ${health.days_left}`);
} catch (error) {
  console.error(`Error in gate-readiness-check: ${error.message}`);
  process.exit(1);
}