// OWNER: Diego
// Tutti i prompt Claude centralizzati qui — facile iterare senza toccare la logica

export const RECEIPT_VISION_PROMPT = `
Analizza questa immagine di uno scontrino.
Restituisci SOLO un JSON valido con questa struttura, senza testo aggiuntivo:
{
  "items": [{ "name": "string", "price": number, "quantity": number }],
  "total": number,
  "currency": "EUR"
}
Se un campo non è leggibile, usa il valore più probabile.
`

export const SPLIT_PROMPT = (
  receipt: string,
  participants: string[],
  voiceInput: string
) => `
Hai questo scontrino in formato JSON:
${receipt}

Partecipanti: ${participants.join(", ")}

L'utente ha detto: "${voiceInput}"

Dividi il conto secondo le istruzioni vocali. Se non ci sono istruzioni specifiche, dividi equamente.
Restituisci SOLO un JSON valido:
{
  "splits": [
    { "participant": "nome", "amount": number, "items": ["item1", "item2"] }
  ]
}
`
