// server.js
// package.json should include: { "type": "module" }

import express from "express";
import dotenv from "dotenv";
import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";

dotenv.config();

const PORT = process.env.PORT || 4000;

if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY in environment variables.");
    process.exit(1);
}

// JS tool: add two integers
const addNumbers = tool(
    ({ a, b }) => {
        console.log("Tool called with:", a, b);

        const sum = a + b;
        return String(sum);
    },
    {
        name: "add_numbers",
        description: "Add two integers and return the sum.",
        schema: z.object({
            a: z.number().int().describe("First integer"),
            b: z.number().int().describe("Second integer"),
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
    tools: [addNumbers],
    systemPrompt:
        "You are a helpful assistant. When the user asks to add two integers, call the add_numbers tool with the two integers. Return only the final answer clearly.",
});

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

        const reply = result.messages.at(-1)?.content || "No response.";

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