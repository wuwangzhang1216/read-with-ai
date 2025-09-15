# PDF Translation Service with Layout Preservation

This service provides advanced PDF translation capabilities that preserve the original document layout using PyMuPDF.

## Features

- **Layout Preservation**: Maintains original PDF formatting, fonts, and positioning
- **Two Translation Methods**:
  - **Overlay Method**: Best for PDFs with complex backgrounds and images
  - **Redaction Method**: Optimal for text-heavy documents
  - **Auto Mode**: Automatically selects the best method based on PDF analysis
- **Multi-language Support**: Supports translation to 30+ languages
- **Fast Processing**: Direct PDF manipulation for quick translations

## Installation

### Prerequisites

- Python 3.8 or higher
- Node.js and npm (for the main application)

### Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Run the setup script:
```bash
./setup_python.sh
```

Or manually install dependencies:
```bash
pip3 install -r requirements.txt
```

### Required Python Packages

- `PyMuPDF` (1.24.2): PDF manipulation and layout preservation
- `openai` (1.35.3): Translation API
- `python-dotenv` (1.0.1): Environment variable management

## Usage

### Starting the Server

1. Start the Node.js server (handles API endpoints):
```bash
npm start
```

The server will run on port 3001 by default.

### API Endpoints

#### Python Translation Endpoint (Recommended)
`POST /api/translate-pdf-python`

Translates PDF using PyMuPDF for better layout preservation.

**Parameters:**
- `pdf`: PDF file (multipart/form-data)
- `targetLanguage`: Target language (e.g., "Chinese", "Spanish")
- `method`: Translation method ("overlay", "redaction", or "auto")
- `apiKey`: OpenAI API key

**Response:** Translated PDF file

#### Legacy Translation Endpoint
`POST /api/translate-pdf`

Uses pdf-lib for basic translation (less accurate layout preservation).

## Translation Methods Explained

### Overlay Method
- Creates white rectangles over original text
- Adds translated text on top
- Preserves images and complex backgrounds
- Best for: Documents with graphics, images, or colored backgrounds

### Redaction Method
- Removes original text using redaction
- Inserts translated text in place
- More efficient for text-heavy documents
- Best for: Plain text documents, academic papers

### Auto Mode
- Analyzes PDF structure
- Counts images, text blocks, and graphics
- Automatically selects the optimal method
- Recommended for most use cases

## Frontend Integration

The translation service is integrated with the React frontend through:

1. **TranslationPanel Component**: UI for selecting languages and options
2. **TranslationService**: TypeScript service handling API calls
3. **TranslatedPdfViewer**: Component for displaying translated PDFs

### Enable Layout Preservation

In the Translation Panel, check "Preserve PDF layout" to use the Python service.

## Environment Variables

Set these in your `.env` file:

```
API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key  # For content translation
```

## Troubleshooting

### Python Not Found
Ensure Python 3 is installed and in your PATH:
```bash
python3 --version
```

### Module Import Errors
Install missing modules:
```bash
pip3 install PyMuPDF openai
```

### Font Issues
The service attempts to use system fonts for the target language. If characters appear as boxes:
- macOS: System fonts should work automatically
- Linux: Install appropriate font packages (e.g., `fonts-noto-cjk` for Asian languages)
- Windows: Ensure language packs are installed

### Translation Quality
- Use GPT-4 models for better quality (update model in pdf_translator.py)
- For technical documents, consider using specialized models

## Performance Tips

1. **File Size**: Works best with PDFs under 50MB
2. **Page Count**: For documents over 100 pages, consider batch processing
3. **Network**: Ensure stable internet for API calls
4. **Caching**: Translated PDFs are cached in the database

## Development

### Testing the Python Service

```bash
# Test with command line
python3 pdf_translator.py input.pdf output.pdf YOUR_API_KEY Chinese auto

# Test with stdin (as used by the server)
echo '{"pdf_base64": "...", "target_language": "Chinese", "method": "auto", "api_key": "..."}' | python3 pdf_translator.py -
```

### Adding New Languages

Edit `translationService.ts` and add to the `getAvailableLanguages()` method.

## Known Limitations

1. **Complex Layouts**: Tables and multi-column layouts may need adjustment
2. **Scanned PDFs**: OCR is not included; text must be selectable
3. **Right-to-Left Languages**: May require additional configuration
4. **Mathematical Formulas**: Complex equations may not translate perfectly

## Future Improvements

- [ ] OCR support for scanned documents
- [ ] Batch processing for large documents
- [ ] Custom font support per language
- [ ] Translation memory for consistency
- [ ] Parallel page processing