# Read with AI - Interactive PDF Reader with AI Assistant

An intelligent PDF reading application that combines AI-powered Q&A, real-time translation, and advanced search capabilities.

## Features

### 📚 Core Features
- **PDF Viewer**: High-performance PDF rendering with zoom, navigation, and text selection
- **AI Chat Assistant**: Context-aware Q&A using Google Gemini AI
- **Real-time Translation**: Full PDF translation preserving original layout
- **Dual Search**: Intelligent search across both book content and chat history
- **Multi-book Support**: Manage and switch between multiple PDF documents
- **Persistent Storage**: Local IndexedDB storage for books and conversations

### 🌍 Translation Features
- **Language Support**: Translate PDFs between multiple languages (English, Chinese, Japanese, etc.)
- **Layout Preservation**: Maintains original PDF formatting and structure
- **Progress Tracking**: Real-time progress indicators during translation
- **Auto-open**: Automatically opens translated version upon completion
- **Overlay Method**: Advanced text replacement using PyMuPDF redaction

### 🤖 AI Capabilities
- **Enhanced RAG**: Advanced retrieval-augmented generation with chain-of-thought reasoning
- **Vector Search**: Semantic search using embeddings for relevant content retrieval
- **Context Awareness**: AI maintains conversation context across sessions
- **Tool Selection**: Dynamic tool usage based on query requirements

## Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **Google Gemini API Key**

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/read-with-ai.git
cd read-with-ai
```

### 2. Install Node.js dependencies
```bash
npm install
```

### 3. Install Python dependencies
```bash
cd server
pip install -r requirements.txt
cd ..
```

### 4. Configure environment variables
Create a `.env.local` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

## Running the Application

### Start both frontend and backend servers:
```bash
npm run dev
```

This will start:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Alternative: Run servers separately
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd server
npm start
```

## Usage Guide

### 1. Upload a PDF
- Click "Upload PDF" button in the library
- Select your PDF file
- Wait for processing and embedding generation

### 2. Chat with your PDF
- Ask questions about the content
- AI will search relevant sections and provide contextual answers
- View reasoning process with "Show Reasoning" toggle

### 3. Translate a PDF
- Select a book from your library
- Click "Translate Book" button
- Choose target language
- Monitor progress (incremental updates based on page count)
- Translated version auto-opens upon completion

### 4. Search Features
- **Book Search**: Semantic search within PDF content
- **Chat History Search**: Search through previous conversations
- **Hybrid Search**: AI automatically determines optimal search strategy

## Architecture

### Frontend Stack
- **React** with TypeScript
- **react-pdf** for PDF rendering
- **IndexedDB** via custom service for local storage
- **Vite** for build tooling

### Backend Stack
- **Express.js** server
- **Python** subprocess for PDF translation
- **PyMuPDF (fitz)** for PDF manipulation
- **Google Gemini API** (gemini-2.0-flash-lite model)

### Key Components
- `PdfJsViewer.tsx`: PDF rendering with navigation controls
- `TranslatedPdfViewer.tsx`: Specialized viewer for translated documents
- `TranslationPanel.tsx`: Translation interface with progress tracking
- `pdf_translator.py`: Core translation logic using PyMuPDF
- `enhancedRagService.ts`: Advanced RAG implementation
- `dbService.ts`: IndexedDB abstraction layer

## Recent Updates

### Translation System Overhaul
- Migrated from OpenAI to Google Gemini API (gemini-2.0-flash-lite)
- Implemented proper text overlay/redaction for authentic translation
- Fixed ArrayBuffer detachment issues with React key-based remounting
- Added realistic progress simulation based on page count

### UI/UX Improvements
- Auto-open translated documents after completion
- Enhanced progress indicators with page-level updates
- Improved error handling and user feedback
- Streamlined translation workflow

### Bug Fixes
- Resolved JSON parsing errors in Python subprocess
- Fixed progress bar jumping from 0 to 100
- Addressed ArrayBuffer detachment when switching books
- Corrected text replacement logic (overlay vs append)

## API Endpoints

### Translation
- `POST /api/translate` - Translate entire PDF document
- `POST /api/translate-text` - Translate text snippets

### Chat
- `POST /api/enhanced-rag` - Enhanced RAG with reasoning
- `POST /api/chat` - Standard chat interaction

### Embeddings
- `POST /api/embeddings` - Generate text embeddings

## Troubleshooting

### Common Issues

1. **Translation fails with API error**
   - Verify GEMINI_API_KEY is set correctly
   - Check API quota and rate limits

2. **PDF not displaying after translation**
   - Clear browser cache
   - Check console for ArrayBuffer errors
   - Verify Python dependencies installed

3. **Progress bar not updating**
   - Ensure server is running
   - Check network tab for API responses

4. **Chat not responding**
   - Verify embeddings generated for PDF
   - Check API key configuration

## Development

### Project Structure
```
read-with-ai/
├── components/        # React components
├── services/         # Service layer (DB, API, etc.)
├── server/           # Backend server
│   ├── pdf_translator.py
│   └── server.js
├── types.ts          # TypeScript definitions
└── App.tsx           # Main application
```

### Key Technologies
- Google Gemini API (gemini-2.0-flash-lite)
- PyMuPDF for PDF manipulation
- React with TypeScript
- IndexedDB for local storage
- Express.js backend

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub or contact the development team.
