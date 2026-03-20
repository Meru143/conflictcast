// Probot app entry point — registers all handlers.
import type { ApplicationFunction } from "probot";
import { Probot, run } from "probot";

const app: ApplicationFunction = (probot: Probot) => {
  probot.on("pull_request.opened", async () => {});
};

export default app;

if (require.main === module) {
  void run(app);
}
