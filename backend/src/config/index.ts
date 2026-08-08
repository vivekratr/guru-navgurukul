import { config as loadDotenv } from "dotenv";

import { loadEnv, type Env } from "./env.js";

loadDotenv();

export const env: Env = loadEnv();

export type { Env };
