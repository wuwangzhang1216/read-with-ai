"""
PDF Translation Service with Layout Preservation
Adapted for Read with AI application
"""

import os
import sys
import json
import base64
from typing import Dict, Optional, Tuple
from pathlib import Path
import google.generativeai as genai
import fitz  # PyMuPDF
import tempfile
from dataclasses import dataclass

@dataclass
class TranslationConfig:
    """Configuration for translation service"""
    api_key: str
    model: str = "gemini-2.0-flash-lite"  # Use gemini-2.0-flash-lite as requested
    target_language: str = "Chinese"
    method: str = "overlay"  # overlay, redaction, or auto

class PDFTranslator:
    """
    PDF translator that preserves layout using PyMuPDF.
    Creates a completely new translated PDF, not just adding translations below.
    """

    def __init__(self, config: TranslationConfig):
        """Initialize the translator with configuration."""
        genai.configure(api_key=config.api_key)
        self.model = genai.GenerativeModel(config.model)
        self.model_name = config.model
        self.target_language = config.target_language
        self.method = config.method

    def translate_text(self, text: str) -> str:
        """
        Translate text using Google Gemini API.

        Args:
            text: Text to translate

        Returns:
            Translated text
        """
        if not text or not text.strip():
            return text

        try:
            prompt = (
                f"You are a professional technical translator. Translate into {self.target_language} with precise domain terminology.\n\n"
                f"Translate to {self.target_language} with native, accurate, technical wording.\n"
                "Strictly preserve original formatting and layout: line breaks, indentation, spacing, bullet/numbered lists.\n"
                "Do not add explanations. Do not change capitalization of proper nouns.\n"
                "Do not translate code, CLI commands, file paths, API names, or placeholders.\n"
                "Keep URLs and IDs unchanged.\n\n"
                "Text to translate:\n"
                f"{text}"
            )

            response = self.model.generate_content(prompt)
            return response.text.strip()

        except Exception as e:
            sys.stderr.write(f"Translation error: {str(e)}\n")
            return text

    def translate_pdf_with_overlay(self, input_path: str, output_path: str) -> bool:
        """
        Translate PDF using overlay method to preserve layout.
        Creates a NEW PDF with translated text, not adding text below original.

        Args:
            input_path: Path to input PDF file
            output_path: Path to save translated PDF file

        Returns:
            Success status
        """
        try:
            # Open the source PDF
            src_doc = fitz.open(input_path)

            # Create a NEW document for the translation
            doc = fitz.open()

            for page_num, src_page in enumerate(src_doc, 1):
                # Translating page
                sys.stderr.write(f"Translating page {page_num}/{len(src_doc)}...\n")

                # Create a new page with the same dimensions
                page = doc.new_page(
                    width=src_page.rect.width,
                    height=src_page.rect.height
                )

                # First, copy the original page as background (preserves images, graphics, etc.)
                page.show_pdf_page(page.rect, src_doc, src_page.number)

                # Extract text blocks with position information
                blocks = src_page.get_text("dict")

                # Process each text block
                for block in blocks.get("blocks", []):
                    if block.get("type") == 0:  # Text block
                        # Create white rectangles to cover original text
                        bbox = fitz.Rect(block["bbox"])
                        # Add a white rectangle to hide original text
                        page.draw_rect(bbox, color=(1, 1, 1), fill=(1, 1, 1))

                        # Extract text from the block
                        block_text = ""
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                if span.get("text"):
                                    block_text += span["text"] + " "

                        if block_text.strip():
                            # Translate the text
                            translated_text = self.translate_text(block_text.strip())

                            # Get font information from the first span
                            font_info = None
                            for line in block.get("lines", []):
                                for span in line.get("spans", []):
                                    font_info = span
                                    break
                                if font_info:
                                    break

                            # Insert translated text
                            if font_info:
                                font_size = font_info.get("size", 11)
                                font_color = font_info.get("color", 0)

                                # Convert color from integer to RGB
                                color_rgb = self._int_to_rgb(font_color)

                                # Create HTML with styling
                                html = f'<span style="font-size:{font_size}pt; color:rgb{color_rgb};">{translated_text}</span>'

                                # Insert the translated text in the same position
                                page.insert_htmlbox(
                                    bbox,
                                    html,
                                    css="body { margin: 0; padding: 2px; }"
                                )

            # Save the translated PDF
            doc.save(output_path, garbage=3, deflate=True)
            doc.close()
            src_doc.close()

            return True

        except Exception as e:
            sys.stderr.write(f"Error translating PDF with overlay: {str(e)}\n")
            return False

    def translate_pdf_with_redaction(self, input_path: str, output_path: str) -> bool:
        """
        Translate PDF using redaction method.
        Removes original text and replaces it with translated text.

        Args:
            input_path: Path to input PDF file
            output_path: Path to save translated PDF file

        Returns:
            Success status
        """
        try:
            doc = fitz.open(input_path)

            for page_num, page in enumerate(doc, 1):
                # Translating page
                sys.stderr.write(f"Translating page {page_num}/{len(doc)}...\n")

                # Extract text with detailed information
                blocks = page.get_text("dict", flags=11)

                # Store translation info for later insertion
                translations = []

                # Process each block
                for block in blocks.get("blocks", []):
                    if block.get("type") == 0:  # Text block
                        block_bbox = fitz.Rect(block["bbox"])

                        # Collect text from all spans in the block
                        block_text = ""
                        first_span = None

                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                if not first_span:
                                    first_span = span
                                text = span.get("text", "")
                                if text:
                                    block_text += text + " "

                        if block_text.strip() and first_span:
                            # Translate the text
                            translated = self.translate_text(block_text.strip())

                            # Store translation info
                            translations.append({
                                'bbox': block_bbox,
                                'text': translated,
                                'font_size': first_span.get("size", 11),
                                'color': first_span.get("color", 0),
                                'flags': first_span.get("flags", 0)
                            })

                            # Add redaction annotation to remove original text
                            page.add_redact_annot(block_bbox)

                # Apply redactions (removes original text)
                page.apply_redactions()

                # Insert translated text
                for trans in translations:
                    # Convert color
                    color_rgb = self._int_to_rgb(trans['color'])

                    # Create HTML for better text fitting
                    html = (
                        f'<span style="font-size:{trans["font_size"]}pt; '
                        f'color:rgb{color_rgb}; '
                        f'font-family: sans-serif;">{trans["text"]}</span>'
                    )

                    # Insert text using htmlbox for better layout control
                    page.insert_htmlbox(
                        trans['bbox'],
                        html,
                        css="body { margin: 0; padding: 2px; line-height: 1.2; }"
                    )

            # Optimize and save
            doc.save(output_path, garbage=3, deflate=True, clean=True)
            doc.close()

            return True

        except Exception as e:
            sys.stderr.write(f"Error in redaction translation: {str(e)}\n")
            return False

    def translate_pdf_auto(self, input_path: str, output_path: str) -> bool:
        """
        Automatically choose the best translation method based on PDF analysis.

        Args:
            input_path: Path to input PDF file
            output_path: Path to save translated PDF file

        Returns:
            Success status
        """
        try:
            # Analyze the PDF to determine best approach
            doc = fitz.open(input_path)

            # Check if PDF has images or complex backgrounds
            has_complex_background = False
            total_images = 0
            total_text_blocks = 0

            for page in doc:
                # Count images
                image_list = page.get_images()
                total_images += len(image_list)

                # Count text blocks
                blocks = page.get_text("dict")
                for block in blocks.get("blocks", []):
                    if block.get("type") == 0:
                        total_text_blocks += 1

                # Check for background elements
                if len(page.get_drawings()) > 10:  # Many vector graphics
                    has_complex_background = True

            doc.close()

            # Decide method based on analysis
            if has_complex_background or total_images > total_text_blocks * 0.3:
                # Using overlay method for complex layout
                return self.translate_pdf_with_overlay(input_path, output_path)
            else:
                # Using redaction method for text-heavy document
                return self.translate_pdf_with_redaction(input_path, output_path)

        except Exception as e:
            sys.stderr.write(f"Error in auto translation: {str(e)}\n")
            # Fallback to overlay method
            return self.translate_pdf_with_overlay(input_path, output_path)

    def translate_pdf(self, input_path: str, output_path: str) -> bool:
        """
        Main method to translate PDF based on configured method.

        Args:
            input_path: Path to input PDF file
            output_path: Path to save translated PDF file

        Returns:
            Success status
        """
        if self.method == "overlay":
            return self.translate_pdf_with_overlay(input_path, output_path)
        elif self.method == "redaction":
            return self.translate_pdf_with_redaction(input_path, output_path)
        else:  # auto
            return self.translate_pdf_auto(input_path, output_path)

    def _int_to_rgb(self, color_int: int) -> tuple:
        """Convert integer color to RGB tuple."""
        if color_int == 0:
            return (0, 0, 0)
        r = (color_int >> 16) & 0xFF
        g = (color_int >> 8) & 0xFF
        b = color_int & 0xFF
        return (r, g, b)

    def translate_pdf_base64(self, pdf_base64: str, filename: str = "document.pdf") -> Optional[str]:
        """
        Translate PDF from base64 input and return base64 output.

        Args:
            pdf_base64: Base64 encoded PDF content
            filename: Original filename

        Returns:
            Base64 encoded translated PDF or None if error
        """
        try:
            # Create temporary files
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as input_file:
                # Decode and write input PDF
                pdf_bytes = base64.b64decode(pdf_base64)
                input_file.write(pdf_bytes)
                input_path = input_file.name

            # Create output path
            output_path = input_path.replace('.pdf', '_translated.pdf')

            # Perform translation
            success = self.translate_pdf(input_path, output_path)

            if success:
                # Read and encode output PDF
                with open(output_path, 'rb') as output_file:
                    translated_bytes = output_file.read()
                    translated_base64 = base64.b64encode(translated_bytes).decode('utf-8')

                # Clean up temporary files
                os.unlink(input_path)
                os.unlink(output_path)

                return translated_base64
            else:
                # Clean up on failure
                os.unlink(input_path)
                if os.path.exists(output_path):
                    os.unlink(output_path)
                return None

        except Exception as e:
            sys.stderr.write(f"Error in base64 translation: {str(e)}\n")
            return None


def main():
    """Main function that handles both stdin and file-based input."""
    import sys
    import os

    # Ensure stderr is used for debugging messages
    sys.stderr = sys.__stderr__

    # Check if input is from stdin (indicated by '-' argument)
    if len(sys.argv) == 2 and sys.argv[1] == '-':
        # Read JSON input from stdin
        try:
            input_data = json.loads(sys.stdin.read())

            config = TranslationConfig(
                api_key=input_data['api_key'],
                target_language=input_data.get('target_language', 'Chinese'),
                method=input_data.get('method', 'auto')
            )

            translator = PDFTranslator(config)

            # Translate PDF from base64 input
            translated_base64 = translator.translate_pdf_base64(
                input_data['pdf_base64'],
                input_data.get('filename', 'document.pdf')
            )

            if translated_base64:
                # Output JSON result
                print(json.dumps({
                    'success': True,
                    'pdf_base64': translated_base64
                }))
            else:
                print(json.dumps({
                    'success': False,
                    'error': 'Translation failed'
                }))
                sys.exit(1)

        except Exception as e:
            print(json.dumps({
                'success': False,
                'error': str(e)
            }))
            sys.exit(1)

    # File-based input for testing
    elif len(sys.argv) >= 4:
        input_pdf = sys.argv[1]
        output_pdf = sys.argv[2]
        api_key = sys.argv[3]
        target_language = sys.argv[4] if len(sys.argv) > 4 else "Chinese"
        method = sys.argv[5] if len(sys.argv) > 5 else "auto"

        config = TranslationConfig(
            api_key=api_key,
            target_language=target_language,
            method=method
        )

        translator = PDFTranslator(config)
        success = translator.translate_pdf(input_pdf, output_pdf)

        if success:
            print(f"✅ Translation complete: {output_pdf}")
        else:
            print("❌ Translation failed")
            sys.exit(1)

    else:
        print("Usage: python pdf_translator.py <input_pdf> <output_pdf> <api_key> [target_language] [method]")
        print("   or: python pdf_translator.py - (for stdin JSON input)")
        sys.exit(1)


if __name__ == "__main__":
    main()