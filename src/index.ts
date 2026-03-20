// Probot app entry point — registers all handlers.
import type { ApplicationFunction } from "probot";
import { Probot, run } from "probot";

import { closedHandler } from "./handlers/closed";
import { openedHandler } from "./handlers/opened";
import { synchronizeHandler } from "./handlers/synchronize";

const app: ApplicationFunction = (probot: Probot) => {
  probot.on("pull_request.opened", openedHandler);
  probot.on("pull_request.synchronize", synchronizeHandler);
  probot.on("pull_request.closed", closedHandler);
  probot.on("pull_request.reopened", openedHandler);
};

export default app;

if (require.main === module) {
  void run(app);
}
