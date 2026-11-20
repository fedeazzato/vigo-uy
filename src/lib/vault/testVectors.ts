// Shared recovery-code test vectors (specs/secret-vault.md R4), made with the
// dashcam's Java RecoveryCode.encodeToString; the same eight are pinned in
// vigo-hack dashcam/core/src/test/java/com/vigo/dashcam/core/recovery/VaultPayloadTests.java.
// Public test data: scalars 0, 1, all-ones and SHA-256("vigo-vault-test-vector-N"),
// N = 1..5. None of them protects anything. Imported by tests only.

/** SHA-256 of the 2048 words joined by '\n' (with a final '\n'), the dashcam test's GOLDEN_SHA256. */
export const GOLDEN_WORDLIST_SHA256 = '5bf1619c6549db2fc3d57767fe2730f5c68d9f881f3de3ce4bcfeedb856cac3e'

export const RECOVERY_VECTORS: ReadonlyArray<{ scalarHex: string; words: string }> = [
  {
    scalarHex: '0000000000000000000000000000000000000000000000000000000000000000',
    words:
      'babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad dines',
  },
  {
    scalarHex: '0000000000000000000000000000000000000000000000000000000000000001',
    words:
      'babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad babad famab',
  },
  {
    scalarHex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    words:
      'zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf zuzuf vovag',
  },
  {
    scalarHex: 'af599bd58176171d03c2d73c96fa5ba10508febfcdc537e70c3fa3ed142e3735',
    words:
      'rivup tebap zidob batug lemuk nomiz bukeg kutas genek sadif pefop gisiz kevon mugos zutof salu gakav galom bumu guler tidiz defu vamep rarab',
  },
  {
    scalarHex: '2f101d105e637fe1fe348fd37a7f734f32f9510a146c0d8f839711ccf3d9a7de',
    words:
      'fisin musut gokud sepo gakav zavol zofab nupog tipo tisab vamep pofa fivub redub fazuv nokir bopaz moliz vizuv durip tepe vuvon pomab tileb',
  },
  {
    scalarHex: 'aaa74338c602d74662d2f3eabdd50cf972a9561c5b307bb3e4e2437ca419bbbd',
    words:
      'resek gater telo nizif figap pumel nita larur vukuv zami goder zemab fenob retev marum lire mokut pokur gamad nenu takug bolaf zaniz ridev',
  },
  {
    scalarHex: '299ec4a1b764f5592d14e6c1c953cc0fc71c78f7be96d5e0657b4ed06fd5e201',
    words:
      'feka zimad febak luzim kepez rigot rugas pipel sizub kadut zemer donot masot gemuz vebil tiluv tomon bazoz latev pitu beviz vules neter dumug',
  },
  {
    scalarHex: '66c68ed2e2939d98607247ecbbeaca5fbb00cfb31205d7b39015ad9c599c7aee',
    words:
      'livof fugom rugur sova garus tatuv nabas gusak vuvid vedif ropu silar rode loga tavat gilid tove pina bepas kuzar sozol telo vupo tured',
  },
]

/** The 4th vector as the car's QR shows it. */
export const SAMPLE_PAYLOAD = `vigovault:dashcam:1:${RECOVERY_VECTORS[3].words}`
