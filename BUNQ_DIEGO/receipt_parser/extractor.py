import json
import os
import cv2
import google.generativeai as genai
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

def extract_receipt_data(image, max_retries=1):
    """
    Takes an OpenCV image, calls Gemini Vision API, and parses the returned JSON.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it in a .env file.")

    genai.configure(api_key=gemini_api_key)
    
    # Convert OpenCV image to PIL for Gemini API
    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    
    # We use gemini-2.5-flash, which works well with images and has a generous free tier
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    schema = """
{
  "restaurant": "string or null",
  "date": "YYYY-MM-DD or null",
  "currency": "3-letter code exactly as shown on receipt (e.g. CHF, EUR, USD, GBP)",
  "items": [
    {
      "name": "item name",
      "quantity": 1,
      "unit_price": 0.00,
      "total_price": 0.00,
      "category": "food|drinks|dessert|other",
      "uncertain": false
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "total": 0.00
}
"""
    
    system_prompt = (
        "You are an expert OCR and data extraction system specialized in parsing restaurant receipts. "
        "Extract the information from the receipt into a strict JSON format. "
        "Do not include any string outside of the JSON block. No markdown blocks like ```json. \n\n"
        "CRITICAL RULES:\n"
        "- Read the EXACT prices printed on the receipt. Do NOT approximate, round, or convert prices.\n"
        "- Use the EXACT currency shown on the receipt (e.g. CHF, EUR, USD, GBP). Do NOT convert currencies.\n"
        "- Copy numbers digit-by-digit from the receipt. If you see 4.50, write 4.50, not 3.00.\n"
        "- The total on your JSON must match the total printed on the receipt.\n\n"
        "Other requirements:\n"
        "1. Split bundled items (e.g. '2x Beer 9.00' with unit price 4.50 -> quantity: 2, unit_price: 4.50, total_price: 9.00).\n"
        "2. Categorize every item as food, drinks, dessert, or other.\n"
        "3. Handle handwritten specials and messy layouts.\n"
        "4. If confidence is low on any item or it's hard to read, flag it with 'uncertain': true.\n\n"
        f"Return ONLY valid JSON matching this schema exactly:\n{schema}"
    )

    for attempt in range(max_retries + 1):
        try:
            if attempt > 0:
                prompt_text = "The last response was not valid JSON. Please be extremely precise, return ONLY valid JSON and no other text."
            else:
                prompt_text = system_prompt

            response = model.generate_content(
                [prompt_text, pil_img],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                )
            )
            
            result_text = response.text.strip()
            
            # Clean possible markdown wrap
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            elif result_text.startswith("```"):
                result_text = result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
                
            result_text = result_text.strip()
            
            parsed_json = json.loads(result_text)
            return parsed_json
            
        except json.JSONDecodeError as e:
            print(f"JSON parsing failed on attempt {attempt + 1}: {e}")
            if attempt == max_retries:
                print("Max retries reached. Raw output snippet:", result_text[:200])
                return None
        except Exception as e:
            print(f"Error on attempt {attempt + 1}: {e}")
            if attempt == max_retries:
                raise
