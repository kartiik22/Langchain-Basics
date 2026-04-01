import { useState } from "react";
import "./App.css";

const CHAT_API_URL = import.meta.env.VITE_API_URL || "/api/chat";

function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ask me anything about your users." },
  ]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await response.json();
      const reply =
        typeof data?.reply === "string" ? data.reply : "No response from server.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Request failed. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="chat-page">
      <section className="chat-card">
        <header className="chat-header">
          <h1>Simple Chatbot</h1>
          <p>Frontend in React hooks, backend at /api/chat</p>
        </header>

        {/* Message list: user and assistant bubbles */}
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`bubble ${message.role === "user" ? "user" : "assistant"}`}
            >
              {message.content}
            </div>
          ))}
          {loading && <div className="bubble assistant">Thinking...</div>}
        </div>

        {/* Input form: send message to your API */}
        <form className="chat-form" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
