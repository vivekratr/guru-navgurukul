import { createApp } from "./app.js";
import { env } from "./config/index.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
