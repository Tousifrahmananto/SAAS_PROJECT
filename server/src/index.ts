import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

await connectDatabase();
app.listen(env.PORT, () => console.log(`Hospital Billing API listening on http://localhost:${env.PORT}`));
