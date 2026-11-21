// Fixed ECIES vector for the Bóveda inbox (specs/vault-onboarding.md Phase C), generated once with WebCrypto.
// The same values are pinned in vigo-hack accounts_proxy core InboxCryptoTest.java: both sides must agree byte for byte.
export const INBOX_VECTOR = {
  "userId": "6f1c2b4e-8d3a-4c5b-9e7f-0a1b2c3d4e5f",
  "keyId": "0b9d6a7e-1c2f-4e3d-8a5b-9c0d1e2f3a4b",
  "kind": "dashcam_recovery",
  "words": "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres veinticuatro",
  "recipientSpki": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQQCmGCQ672emC9M/8Fpn07W8Ho+pN4Fah9E+ynuv+QTWaX2wEUrWUjKPkhpdAtgA6oZarfIO3etJXG+Wh0ooxQ==",
  "recipientPkcs8": "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgcXBnoHvJPyrJHv5D8zBCm8XKujfUgslXNoYpFb815tmhRANCAARBAKYYJDrvZ6YL0z/wWmfTtbwej6k3gVqH0T7Ke6/5BNZpfbARStZSMo+SGl0C2ADqhlqt8g7d60lcb5aHSijF",
  "ephemeralSpki": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMWCBpD/x3NaT+tYxsDN5+ul57BRBn6LNfTEfi+Scqo+bQojGRDa4mTIqF9mPLIOuJ/1EcNFxKU/1b11hcqsCQw==",
  "ephemeralPkcs8": "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1q5G8SpQbfuh64iNQR7KcUhrZvXQexL7wVpBUgU1QqGhRANCAAQxYIGkP/Hc1pP61jGwM3n66XnsFEGfos19MR+L5Jyqj5tCiMZENriZMioX2Y8sg64n/URw0XEpT/VvXWFyqwJD",
  "iv": "AQIDBAUGBwgJCgsM",
  "ciphertext": "fY7aTjmGUlswgGCkdXkiVX7HgTqpRzRw5h4qd4EVTGBL9PX1kgRPjU7ay4PqTixNyiUMQQaMxgq6g4zso7+lK25DzFje2AtrAskmjHBVYWw9aUegztgZR6HxxW11kw8WfdMnGk+w5Y1LF+1NelGiTJUKWXJFLLgiSTqPTpINoJ2I3pquc2xsyHQNunktbRUJfO0MklqZTqsilrG2NQuJQr6ci2M7zebd/l0IF0og8ZiaCaedK4JPFAXr998+OD3z"
} as const
