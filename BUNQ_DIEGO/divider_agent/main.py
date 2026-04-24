import argparse
import json
from agent import parse_expenses, compute_balances, format_balances


def main():
    parser = argparse.ArgumentParser(
        description="Divider Agent — split shared expenses from a text description."
    )
    parser.add_argument(
        "text",
        nargs="?",
        help="The expense description text (or use --file to read from a file)",
    )
    parser.add_argument(
        "--file", "-f", help="Read the expense description from a text file"
    )
    parser.add_argument(
        "--output", "-o", help="Save the result JSON to a file (e.g. balance.json)"
    )
    args = parser.parse_args()

    # Get the input text
    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    elif args.text:
        text = args.text
    else:
        print("Enter your expense description (press Enter twice to submit):\n")
        lines = []
        while True:
            line = input()
            if line == "":
                break
            lines.append(line)
        text = "\n".join(lines)

    if not text.strip():
        print("Error: No text provided.")
        return

    print(f'\nInput: "{text}"\n')
    print("Parsing expenses with Gemini...")

    # Step 1: Parse text into structured transactions
    parsed = parse_expenses(text)
    if not parsed:
        print("Failed to parse the expense description.")
        return

    print(f"\nDetected {len(parsed['people'])} people: {', '.join(parsed['people'])}")
    print(f"Found {len(parsed['transactions'])} transactions")

    # Step 2: Compute balances
    simplified, currency = compute_balances(parsed)

    # Step 3: Display and optionally save
    result = format_balances(simplified, currency, parsed)

    if args.output and result:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n  -> Result saved to {args.output}")


if __name__ == "__main__":
    main()
