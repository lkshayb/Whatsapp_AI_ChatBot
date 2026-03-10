# WhatsApp Legal AI Chatbot

A WhatsApp-based AI chatbot that answers legal queries using Google's Gemini API and retrieves legal information from the Indian Kanoon database.
The system allows users to ask legal questions through WhatsApp and receive AI-generated explanations based on real legal sources.

## Features

- WhatsApp-based chatbot interface
- AI-powered legal query understanding using Gemini API
- Retrieval of legal information from API
- Real-time messaging with chat history support
- Query logging and duplicate query detection
- Simple backend architecture using Node.js and TypeScript

## System Workflow

1. User sends a query through WhatsApp
2. The backend server receives the message
3. Query is checked for duplicates and logged
4. Relevant information is fetched from the API
5. LLM processes the information and generates a response
6. The response is sent back to the user via WhatsApp
