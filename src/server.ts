// Probot runtime bootstrap — starts the app server.
import "dotenv/config";

import { run } from "probot";

import app from "./index";

void run(app);
