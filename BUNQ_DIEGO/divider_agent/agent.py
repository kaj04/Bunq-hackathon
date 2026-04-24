import json
import os
import anthropic
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()


def parse_expenses(text, max_retries=1):
    """
    Uses Claude to parse natural language about shared expenses into
    structured transactions.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set. Add it to the .env file.")

    client = anthropic.Anthropic(api_key=api_key)

    schema = """
{
  "user_name": "the name of the person speaking (the 'I' in the text)",
  "people": ["list", "of", "all", "people", "mentioned", "including the speaker"],
  "currency": "EUR/USD/GBP/etc",
  "transactions": [
    {
      "description": "short description of what was paid for",
      "payer": "name of who actually paid the money",
      "amount": 0.00,
      "beneficiaries": ["list of people who consumed or benefited from this expense"]
    }
  ]
}
"""

    system_prompt = (
        "You are an expense-splitting assistant. A user will describe shared expenses in natural language. "
        "Your job is to parse this into structured JSON.\n\n"
        "CRITICAL RULES:\n"
        "- Identify ALL people mentioned, including the speaker (the 'I'). "
        "If the speaker's name is not explicitly stated, use 'Me' as their name.\n"
        "- For each expense, determine WHO PAID and WHO BENEFITED (consumed the item).\n"
        "- 'I paid for drinks' means the speaker paid. The beneficiaries are whoever consumed those drinks based on context.\n"
        "- 'Mario and I shared a drink' means both are beneficiaries.\n"
        "- 'I paid for a beer for Luis' means the speaker paid, Luis is the sole beneficiary.\n"
        "- 'I paid 20 euros for drinks' for a group means everyone in the group benefits equally unless stated otherwise.\n"
        "- Read amounts EXACTLY as stated. Do not invent or change numbers.\n"
        "- If the text says a specific person paid, that person is the payer.\n"
        "- Return ONLY valid JSON, no markdown, no explanation.\n\n"
        f"JSON schema:\n{schema}"
    )

    for attempt in range(max_retries + 1):
        try:
            if attempt > 0:
                user_prompt = f"The last response was not valid JSON. Try again. Text:\n{text}"
            else:
                user_prompt = f"Parse the following expense description:\n\n{text}"

            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                temperature=0.0,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            result_text = response.content[0].text.strip()

            # Strip markdown wrapper if present
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            elif result_text.startswith("```"):
                result_text = result_text[3:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()

            return json.loads(result_text)

        except json.JSONDecodeError as e:
            print(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt == max_retries:
                print("Raw output:", result_text[:300])
                return None
        except Exception as e:
            print(f"Error (attempt {attempt + 1}): {e}")
            if attempt == max_retries:
                raise


def compute_balances(parsed_data):
    """
    Given the parsed transaction data, compute who owes whom and the final
    simplified balances.
    """
    people = parsed_data["people"]
    transactions = parsed_data["transactions"]
    currency = parsed_data.get("currency", "EUR")

    # Track net balance for each pair: debts[A][B] = amount A owes B
    debts = defaultdict(lambda: defaultdict(float))

    print("\n--- Transaction Breakdown ---")
    for i, tx in enumerate(transactions, 1):
        payer = tx["payer"]
        amount = tx["amount"]
        beneficiaries = tx["beneficiaries"]
        share = amount / len(beneficiaries)

        print(f"\n  {i}. {tx['description']}")
        print(f"     Payer: {payer} | Amount: {amount:.2f} {currency}")
        print(f"     Split among: {', '.join(beneficiaries)} ({share:.2f} each)")

        for person in beneficiaries:
            if person != payer:
                debts[person][payer] += share

    # Simplify debts: if A owes B and B owes A, net them out
    simplified = defaultdict(lambda: defaultdict(float))
    all_people = set()
    for debtor in debts:
        for creditor in debts[debtor]:
            all_people.add(debtor)
            all_people.add(creditor)

    processed = set()
    for a in all_people:
        for b in all_people:
            if a == b:
                continue
            pair = tuple(sorted([a, b]))
            if pair in processed:
                continue
            processed.add(pair)

            a_owes_b = debts[a][b]
            b_owes_a = debts[b][a]
            net = a_owes_b - b_owes_a

            if net > 0.005:
                simplified[a][b] = round(net, 2)
            elif net < -0.005:
                simplified[b][a] = round(-net, 2)

    return simplified, currency


def format_balances(simplified, currency, parsed_data):
    """
    Pretty-print the final balances.
    """
    user_name = parsed_data.get("user_name", "Me")

    print("\n" + "=" * 40)
    print("  FINAL BALANCE")
    print("=" * 40)

    if not simplified:
        print("  Everyone is settled up! No debts.")
        return

    for debtor in simplified:
        for creditor in simplified[debtor]:
            amount = simplified[debtor][creditor]
            print(f"  {debtor} owes {creditor}: {amount:.2f} {currency}")

    print("=" * 40)

    # Build a summary dict for JSON output
    result = {
        "user": user_name,
        "people": parsed_data["people"],
        "currency": currency,
        "settlements": [],
    }
    for debtor in simplified:
        for creditor in simplified[debtor]:
            result["settlements"].append(
                {
                    "from": debtor,
                    "to": creditor,
                    "amount": simplified[debtor][creditor],
                }
            )
    return result
