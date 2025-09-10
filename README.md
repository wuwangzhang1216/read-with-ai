<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Hn7XMfyIw9qdlWMIfqesnxUtFV-ygM4O

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Chat History Search

The assistant now includes a chat-history search tool in addition to book vector search.

- The agent dynamically decides whether to search the book, chat history, or both, based on the question.
- A flexible system prompt describes available tools (not hard-coded to one behavior).
- In the chat UI, you’ll see tool events like "Tool Selection" and "Chat History Search" during reasoning.
