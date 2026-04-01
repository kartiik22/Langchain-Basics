// server.js
// package.json should include: { "type": "module" }

import express from "express";
import dotenv from "dotenv";
import dns from "dns";
import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
import { MongoClient } from "mongodb";

dotenv.config();

const PORT = process.env.PORT || 4000;

if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY in environment variables.");
    process.exit(1);
}
const mdb = process.env.MONGODB_URL;
if (!mdb) {
  console.error("Missing MONGODB_URL in environment variables.");
  process.exit(1);
}

const dnsServers = process.env.DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
  console.log("Using custom DNS servers:", dnsServers);
} else if (mdb.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  console.log("Using fallback DNS servers for SRV resolution.");
}

const mongoClient = new MongoClient(mdb);
try {
  await mongoClient.connect();
  console.log("✅ MongoDB connected successfully!");
} catch (error) {
  console.error("MongoDB connection failed:", error.message);
  process.exit(1);
}

const dbName = process.env.MONGODB_DB;
if (!dbName) {
  console.error("Missing MONGODB_DB in environment variables.");
  process.exit(1);
}

const usersCollectionEnv = process.env.MONGODB_USERS_COLLECTION?.trim();
if (!usersCollectionEnv || usersCollectionEnv.includes("=")) {
  console.warn(
    "Invalid MONGODB_USERS_COLLECTION value detected. Defaulting to 'users'."
  );
}

const db = mongoClient.db(dbName);
const usersCollectionName =
  usersCollectionEnv && !usersCollectionEnv.includes("=")
    ? usersCollectionEnv
    : "users";
const usersCollection = db.collection(usersCollectionName);

// -------------- DB tool --------------
// LLM builds a MongoDB `query` object, this tool runs it and returns rows.
const searchUsers = tool(
  async ({ query }) => {
    const mongoQuery =
      query && typeof query === "object" ? query : {};
    console.log(query);
    const results = await usersCollection
      .find(mongoQuery)
      .project({
        // never send secrets back to the model
        password: 0,
        hash: 0,
        salt: 0,
      })
      .toArray();

    return JSON.stringify({ queryUsed: mongoQuery, count: results.length, results });
  },
  {
    name: "search_users",
    description:
      "Run a MongoDB find on the users collection using the given Mongo query object.",
    schema: z.object({
      query: z
        .record(z.string(), z.unknown())
        .describe("MongoDB query object to pass into usersCollection.find(query)"),
    }),
  }
);
// Groq model
const model = new ChatGroq({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: 0,
    maxRetries: 2,
});

// Agent wired with the tool
const agent = createAgent({
    model,
    tools: [searchUsers],
    systemPrompt:
          // Simple pipeline:
          // 1) Read the user's question.
          // 2) If it is about users/user data, build a MongoDB query object.
          // 3) Call `search_users` exactly once with that query.
          // 4) Look at the tool result and answer in natural language.
          // 5) If there are no rows, clearly say no matching users were found.
          // Never invent users or fields that are not in the tool output.
          `You are a helpful assistant for user-data questions. 
          For any request about users, first build a MongoDB query object 
          When searching names, use case-insensitive regex if the user gives partial names.
Example: { firstName: { $regex: "^kart", $options: "i" } }
          and call search_users exactly once with that query. 
          Then answer strictly from the tool output. 
          If no results are returned, clearly say no matching users were found. 
          Do not invent data.`,
}).withConfig({ recursionLimit: 4 });

const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
    try {
        const message = String(req.body?.message ?? "").trim();

        if (!message) {
            return res.status(400).json({ error: "message is required" });
        }

        const result = await agent.invoke({
            messages: [{ role: "user", content: message }],
        });

        const getMessageContent = (message) => {
          if (!message) return undefined;
          if (typeof message.content === "string") return message.content.trim() || undefined;
          if (Array.isArray(message.content)) {
            return message.content
              .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
              .join("")
              .trim() || undefined;
          }
          if (message.content && typeof message.content === "object") {
            return JSON.stringify(message.content);
          }
          return undefined;
        };

        const messages = Array.isArray(result.messages) ? result.messages : [];

        // Find the last "assistant-like" message that has content.
        const replyMessage = [...messages]
          .reverse()
          .find((m) => {
            const content = getMessageContent(m);
            if (!content) return false;
            return m.role !== "user" && m.type !== "human";
          });

        const reply =
          getMessageContent(replyMessage) ??
          getMessageContent(messages[messages.length - 1]) ??
          "No response.";

        return res.json({ reply });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: error?.message || "Server error",
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});