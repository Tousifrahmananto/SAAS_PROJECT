import { setServers } from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  if (env.DNS_SERVERS) {
    setServers(env.DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean));
  }
  await mongoose.connect(env.MONGODB_URI);
}
