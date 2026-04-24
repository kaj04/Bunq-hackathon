#python main.py sample_receipt.jpg -o result.json          
import argparse
import json
import os
from cv_preprocessing import preprocess_image
from extractor import extract_receipt_data

def main():
    parser = argparse.ArgumentParser(description="Extract structured data from a restaurant bill.")
    parser.add_argument("image_path", help="Path to the input receipt image")
    parser.add_argument("--save-cv", help="Path to save the preprocessed OpenCV image", default=None)
    parser.add_argument("--output", "-o", help="Path to save the extracted JSON (e.g. result.json)", default=None)
    args = parser.parse_args()

    if not os.path.exists(args.image_path):
        print(f"Error: Could not find image at {args.image_path}")
        return

    print("Step 1/2: Preprocessing image with OpenCV...")
    processed_image = preprocess_image(args.image_path, args.save_cv)
    if args.save_cv:
        print(f"  -> Preprocessed image saved to {args.save_cv}")

    print("Step 2/2: Sending image to Gemini Vision API for extraction...")
    try:
        data = extract_receipt_data(processed_image)
        if data:
            pretty_json = json.dumps(data, indent=2, ensure_ascii=False)
            print("\n----- EXTRACTION SUCCESSFUL -----")
            print(pretty_json)

            # Save to file if --output is provided
            if args.output:
                with open(args.output, "w", encoding="utf-8") as f:
                    f.write(pretty_json)
                print(f"\n  -> JSON saved to {args.output}")
        else:
            print("\n----- EXTRACTION FAILED -----")
    except Exception as e:
        print(f"\nFailed to process receipt: {e}")

if __name__ == "__main__":
    main()
