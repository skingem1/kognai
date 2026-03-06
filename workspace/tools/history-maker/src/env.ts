// env.ts — import this FIRST in any entry point
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.env.HOME ?? '/Users/tarekmnif', 'kognai', '.env'), override: true });
