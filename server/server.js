const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts, PDFName, PDFHexString } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3001;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Helper function to load Chinese font
async function loadChineseFont(pdfDoc) {
  // Register fontkit for custom font support
  pdfDoc.registerFontkit(fontkit);

  try {
    // Try to load a system Chinese font
    const possibleFonts = [
      '/System/Library/Fonts/PingFang.ttc', // macOS Chinese font
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', // macOS Unicode font
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', // Linux
      'C:\\Windows\\Fonts\\msyh.ttc', // Windows Chinese font
    ];

    for (const fontPath of possibleFonts) {
      try {
        const fontBytes = await fs.readFile(fontPath);
        console.log(`Loading font from: ${fontPath}`);
        const font = await pdfDoc.embedFont(fontBytes, { subset: true });
        console.log('Successfully loaded Chinese-capable font');
        return font;
      } catch (e) {
        // Try next font
        continue;
      }
    }

    console.log('No local Chinese fonts found, using fallback approach');
  } catch (error) {
    console.error('Failed to load Chinese font:', error);
  }

  // Return null to indicate no Chinese font available
  return null;
}

// Method 1: Overlay - Add translated text as an overlay layer
async function overlayMethod(pdfBuffer, chunks, targetLanguage) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const chineseFont = await loadChineseFont(pdfDoc);

    if (!chineseFont) {
      console.warn('No Chinese font available, using default font');
      const defaultFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      return pdfDoc; // Return original if we can't add Chinese text
    }

    const pages = pdfDoc.getPages();

    // Group chunks by page
    const chunksByPage = {};
    chunks.forEach(chunk => {
      if (!chunksByPage[chunk.pageNumber]) {
        chunksByPage[chunk.pageNumber] = [];
      }
      chunksByPage[chunk.pageNumber].push(chunk);
    });

    // Process each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;
      const pageChunks = chunksByPage[pageNumber] || [];

      if (pageChunks.length === 0) continue;

      const { width, height } = page.getSize();

      // Combine translated text for this page
      const translatedText = pageChunks
        .map(chunk => chunk.content)
        .join('\n')
        .replace(/\[SEGMENT \d+\]\s*/g, '')
        .replace(/\s*\[END SEGMENT \d+\]/g, '');

      // Create text overlay with semi-transparent background
      // This preserves the original content while adding translation
      const fontSize = 10;
      const margin = 40;
      const lineHeight = fontSize * 1.4;
      const maxWidth = width - (margin * 2);

      // Split text into lines
      const chars = Array.from(translatedText);
      const lines = [];
      let currentLine = '';
      let currentWidth = 0;

      for (const char of chars) {
        if (char === '\n') {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
            currentWidth = 0;
          }
          continue;
        }

        let charWidth = fontSize * 0.6; // Estimate for Chinese characters
        try {
          charWidth = chineseFont.widthOfTextAtSize(char, fontSize);
        } catch (e) {
          // Use estimate if measurement fails
        }

        if (currentWidth + charWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = char;
          currentWidth = charWidth;
        } else {
          currentLine += char;
          currentWidth += charWidth;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }

      // Add semi-transparent white box at bottom of page for translation
      const boxHeight = Math.min(height * 0.3, (lines.length + 1) * lineHeight + 20);
      const boxY = 10;

      page.drawRectangle({
        x: margin,
        y: boxY,
        width: width - (margin * 2),
        height: boxHeight,
        color: rgb(1, 1, 1),
        opacity: 0.9,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });

      // Draw translated text in the box
      let yPosition = boxY + boxHeight - 20;
      for (let i = 0; i < lines.length && yPosition > boxY + 10; i++) {
        try {
          page.drawText(lines[i], {
            x: margin + 10,
            y: yPosition,
            size: fontSize,
            font: chineseFont,
            color: rgb(0, 0, 0),
          });
        } catch (error) {
          console.warn(`Could not draw line: ${lines[i].substring(0, 20)}...`);
        }
        yPosition -= lineHeight;
      }
    }

    return pdfDoc;
  } catch (error) {
    console.error('Overlay method error:', error);
    throw error;
  }
}

// Method 2: Redaction - Hide original text and add translated text
async function redactionMethod(pdfBuffer, chunks, targetLanguage) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const chineseFont = await loadChineseFont(pdfDoc);

    if (!chineseFont) {
      console.warn('No Chinese font available for redaction');
      return await overlayMethod(pdfBuffer, chunks, targetLanguage); // Fallback to overlay
    }

    const pages = pdfDoc.getPages();

    // Group chunks by page
    const chunksByPage = {};
    chunks.forEach(chunk => {
      if (!chunksByPage[chunk.pageNumber]) {
        chunksByPage[chunk.pageNumber] = [];
      }
      chunksByPage[chunk.pageNumber].push(chunk);
    });

    // Process each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;
      const pageChunks = chunksByPage[pageNumber] || [];

      if (pageChunks.length === 0) continue;

      const { width, height } = page.getSize();

      // Get the page content and try to identify text areas
      // This is simplified - full implementation would parse content streams

      // For now, we'll add white rectangles over common text areas
      // and then add translated text

      // Cover main text area (approximate)
      page.drawRectangle({
        x: 50,
        y: height * 0.15,
        width: width - 100,
        height: height * 0.7,
        color: rgb(1, 1, 1),
        opacity: 1,
      });

      // Add translated text
      const translatedText = pageChunks
        .map(chunk => chunk.content)
        .join('\n\n')
        .replace(/\[SEGMENT \d+\]\s*/g, '')
        .replace(/\s*\[END SEGMENT \d+\]/g, '');

      const fontSize = 11;
      const margin = 60;
      const lineHeight = fontSize * 1.5;
      const maxWidth = width - (margin * 2);

      // Split text into lines
      const chars = Array.from(translatedText);
      const lines = [];
      let currentLine = '';
      let currentWidth = 0;

      for (const char of chars) {
        if (char === '\n') {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
            currentWidth = 0;
          }
          lines.push(''); // Preserve paragraph breaks
          continue;
        }

        let charWidth = fontSize * 0.6;
        try {
          charWidth = chineseFont.widthOfTextAtSize(char, fontSize);
        } catch (e) {
          // Use estimate
        }

        if (currentWidth + charWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = char;
          currentWidth = charWidth;
        } else {
          currentLine += char;
          currentWidth += charWidth;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }

      // Draw translated text
      let yPosition = height - 100;
      for (const line of lines) {
        if (yPosition < 50) break;

        if (line) { // Skip empty lines for paragraph breaks
          try {
            page.drawText(line, {
              x: margin,
              y: yPosition,
              size: fontSize,
              font: chineseFont,
              color: rgb(0, 0, 0),
            });
          } catch (error) {
            console.warn(`Could not draw line: ${line.substring(0, 20)}...`);
          }
        }
        yPosition -= lineHeight;
      }
    }

    return pdfDoc;
  } catch (error) {
    console.error('Redaction method error:', error);
    throw error;
  }
}

// Endpoint to generate translated PDF
app.post('/api/translate-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { targetLanguage = 'Chinese', chunks, method = 'overlay' } = req.body;
    const pdfBuffer = req.file?.buffer;

    if (!pdfBuffer || !chunks) {
      return res.status(400).json({ error: 'Missing PDF file or chunks data' });
    }

    // Parse chunks if it's a string
    const parsedChunks = typeof chunks === 'string' ? JSON.parse(chunks) : chunks;

    console.log(`Generating translated PDF with ${parsedChunks.length} chunks using ${method} method`);

    // Choose method based on parameter
    let pdfDoc;
    if (method === 'redaction') {
      pdfDoc = await redactionMethod(pdfBuffer, parsedChunks, targetLanguage);
    } else {
      pdfDoc = await overlayMethod(pdfBuffer, parsedChunks, targetLanguage);
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    // Send the PDF back
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="translated.pdf"');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('PDF translation error:', error);
    res.status(500).json({ error: 'Failed to generate translated PDF', details: error.message });
  }
});

// Endpoint to extract text with positions (for future enhancement)
app.post('/api/extract-text-positions', upload.single('pdf'), async (req, res) => {
  try {
    const pdfBuffer = req.file?.buffer;

    if (!pdfBuffer) {
      return res.status(400).json({ error: 'Missing PDF file' });
    }

    // Parse PDF to extract text and positions
    const data = await pdfParse(pdfBuffer);

    // This is simplified - full implementation would extract actual positions
    const pages = data.numpages;
    const text = data.text;

    res.json({
      pages,
      text,
      info: data.info,
      metadata: data.metadata
    });

  } catch (error) {
    console.error('Text extraction error:', error);
    res.status(500).json({ error: 'Failed to extract text', details: error.message });
  }
});

// New endpoint for Python-based PDF translation with layout preservation
app.post('/api/translate-pdf-python', upload.single('pdf'), async (req, res) => {
  try {
    const pdfBuffer = req.file?.buffer;
    const { targetLanguage = 'Chinese', method = 'auto', apiKey } = req.body;

    if (!pdfBuffer) {
      return res.status(400).json({ error: 'Missing PDF file' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }

    console.log(`Translating PDF using Python service: ${method} method, target: ${targetLanguage}`);

    // Convert PDF buffer to base64
    const pdfBase64 = pdfBuffer.toString('base64');

    // Call Python translation service
    // Use 'python' on Windows, 'python3' on Unix-like systems
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const python = spawn(pythonCommand, [
      path.join(__dirname, 'pdf_translator.py'),
      '-'  // Use stdin for input
    ]);

    let outputData = '';
    let errorData = '';

    // Send input data as JSON
    const inputData = JSON.stringify({
      pdf_base64: pdfBase64,
      target_language: targetLanguage,
      method: method,
      api_key: apiKey
    });

    python.stdin.write(inputData);
    python.stdin.end();

    python.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorData += data.toString();
      console.error('Python stderr:', data.toString());
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python process exited with code:', code);
        console.error('Error output:', errorData);
        return res.status(500).json({
          error: 'Translation failed',
          details: errorData || 'Python process error'
        });
      }

      try {
        const result = JSON.parse(outputData);

        if (result.success && result.pdf_base64) {
          // Convert base64 back to buffer
          const translatedPdfBuffer = Buffer.from(result.pdf_base64, 'base64');

          // Send the PDF back
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="translated.pdf"');
          res.send(translatedPdfBuffer);
        } else {
          res.status(500).json({
            error: 'Translation failed',
            details: result.error || 'Unknown error'
          });
        }
      } catch (parseError) {
        console.error('Failed to parse Python output:', parseError);
        res.status(500).json({
          error: 'Translation failed',
          details: 'Invalid response from translation service'
        });
      }
    });

  } catch (error) {
    console.error('PDF translation error:', error);
    res.status(500).json({ error: 'Failed to translate PDF', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF translation server is running' });
});

app.listen(port, () => {
  console.log(`PDF translation server running on port ${port}`);
});