# PDF contract ingestion — design

**Status:** scoped, ready for an implementation plan
**Sub-project C of:** `2026-09-12-msme-platform-extension-overview.md` — read that file first.
**Owns:** backend + frontend (no Solidity changes)
**Depends on:** nothing above — independently buildable in parallel with Sub-projects A/B

## Problem

Many MSMEs already have a signed PDF for a business relationship (an
existing paper contract, an invoice terms sheet, whatever). Today the
only ingestion path is "upload a WhatsApp export" (`POST
/api/relationships/demo`, which doesn't even read a real file — it
returns one hardcoded canned relationship). There's a real, legitimate
gap here: letting a user hand over an existing PDF is a reasonable second
ingestion path, and was part of the original bigger pitch. **The part of
that pitch that was wrong was storing the PDF's bytes on-chain** (see the
overview, Part 2, reason 2) — this spec keeps the ingestion idea and
fixes the storage mistake.

## Decisions

1. **The PDF is hashed and stored off-chain, exactly like generated contract text already is.** No Solidity change, no new on-chain field. The existing `contentHash`/`verify()` pattern already handles "prove this exact content wasn't altered" — a PDF is just a different *source* of the content being hashed, not a reason to change how anchoring works.
2. **This sub-project does not do document parsing/OCR/clause extraction from the PDF.** That's a separate, much harder problem (turning a PDF into the structured `financial_terms_detected` shape the rest of the pipeline expects) and is explicitly out of scope — see below for the honest interim behavior.
3. **"Off-chain storage" for this hackathon-scoped prototype means: store the file on the backend's local filesystem** (a `backend/uploads/` directory, gitignored), referenced by a generated id, with the SHA/keccak256 hash computed at upload time. This is consistent with the project's existing local-only, no-external-dependency posture (`CHAIN_MODE=mock|real` both run entirely locally; this shouldn't be the first feature to require an external service like S3). A real deployment would swap this for real object storage exactly the way `ChainService` already demonstrates the swap-the-implementation-behind-an-interface pattern — recommend structuring this as a small `documentStore.js` service with that same swappable-interface shape from the start, even though only one (local-disk) implementation is built now.
4. **What replaces "extraction" for a PDF-sourced relationship:** since there's no real parsing, the honest interim UI shows the uploaded PDF alongside a manual entry form for the fields `financial_terms_detected` needs (amount, currency, payment schedule, goods/services, recurring) — the owner fills these in themselves, same shape the WhatsApp-export path's canned data already produces, just human-entered instead of extracted. This keeps the contract-generation step (`contractGenerator.js`) completely unaware of where its input came from — the seam described in `ARCHITECTURE.md` §3 is preserved. If/when the real extraction agent (mentioned throughout `ARCHITECTURE.md` as "Agent 1," still stubbed everywhere) gains PDF support, it slots in here without this ingestion path changing.

## Architecture / data flow

```
Owner, at Step 1 (Connect), picks a new "Upload a signed PDF" connector
card (alongside the existing WhatsApp/Gmail cards)
        │
        ▼
POST /api/relationships/pdf (multipart form: the PDF file + the manually-
entered financial_terms_detected fields)
        │
        ▼
Backend: save the file to backend/uploads/<generated-id>.pdf, compute
keccak256 of the file's bytes, build a relationship object in exactly the
same shape demoRelationship.js already produces (source: "pdf_upload"
instead of "whatsapp_export"), with evidence: [{ type: "attachment",
source_ref: the file id, excerpt: "(PDF contract — see attached
document)" }] standing in for the message-excerpt evidence a chat source
would normally provide
        │
        ▼
db.saveRelationship(relationship) — same function every other ingestion
path already calls; everything downstream (Review step, contract
generation, anchoring) is completely unaware this came from a PDF
instead of a chat export
```

Nothing about Steps 2-5 of the existing wizard changes. This sub-project
is entirely contained in Step 1 plus one new backend route and one new
small storage service.

## Components

### `backend/src/services/documentStore.js` (new)
```javascript
// Swappable interface, one implementation (local disk) — mirrors
// chainService.js's mock/real pattern so a real deployment can swap in
// S3/IPFS/etc. later without touching callers.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { randomUUID } = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

function createLocalDiskStore() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return {
    async save(buffer, originalName) {
      const id = randomUUID();
      const ext = path.extname(originalName || "") || ".pdf";
      const filePath = path.join(UPLOAD_DIR, `${id}${ext}`);
      fs.writeFileSync(filePath, buffer);
      const hash = "0x" + crypto.createHash("sha256").update(buffer).digest("hex");
      return { id, filePath, hash, size: buffer.length };
    },
    async read(id) {
      // find by id prefix — sufficient for this prototype's scale
      const match = fs.readdirSync(UPLOAD_DIR).find((f) => f.startsWith(id));
      if (!match) return null;
      return fs.readFileSync(path.join(UPLOAD_DIR, match));
    }
  };
}

module.exports = { createDocumentStore: createLocalDiskStore };
```
Note: hashing here uses SHA-256 of the raw file bytes for the *document
store's* own integrity check, which is a different value from the
`contentHash` anchored on-chain (that one is `ethers.keccak256` of the
final generated *contract text*, computed by `contractGenerator.js`
exactly as it already is — the PDF's own hash is not what goes on-chain;
the generated agreement text derived from the PDF + manually-entered
terms is what goes on-chain, unchanged from how every other ingestion
path already works). Don't conflate the two hashes.

### `backend/src/routes/relationships.js` (modified)
New route: `POST /api/relationships/pdf`. Needs a multipart-form parser
— `multer` is the standard, minimal choice for Express (a new npm
dependency; flag this explicitly since the rest of this codebase has
avoided adding dependencies beyond what shipped in the original prototype
— this is a deliberate, justified exception, not scope creep, since
there is no way to receive a file upload in Express without either this
or hand-rolling multipart parsing). Validates the file is a PDF
(mimetype + magic-byte check, not just the filename extension), a
reasonable max size (e.g. 10MB), and that the manually-entered terms
object matches the shape `financial_terms_detected` expects. Calls
`documentStore.save(...)`, builds the relationship object, calls
`db.saveRelationship`, returns `{ relationship, insaf }` in the same
shape `/relationships/demo` already returns.

### `frontend/index.html`/`app.js` (modified, Step 1)
Add a third (now fourth, alongside Gmail/WhatsApp/Messenger) connector
card: "Upload a signed PDF." Clicking it reveals a small inline form
(file picker + the manual terms fields: amount, currency, schedule,
goods/services, recurring checkbox) rather than immediately firing an
API call like the WhatsApp path does — this path genuinely needs user
input before it has anything to send, unlike the canned WhatsApp demo.

## Data model addition

No new `db.js` Map — reuses `saveRelationship`/`getRelationship`
unchanged. The only new persistent artifact is the uploaded file itself,
on local disk under `backend/uploads/` (add this directory to
`.gitignore`, same treatment as `node_modules`/`.env` — uploaded user
documents must never be committed to the repo).

## Error handling

| Case | Response |
|---|---|
| Uploaded file isn't actually a PDF (wrong magic bytes) | 400, `{ error: "file does not appear to be a PDF" }` |
| File exceeds the size limit | 400 (multer's built-in limit error, mapped to a clear message) |
| Manually-entered terms are missing required fields | 400, `{ error: "financial terms incomplete" }`, naming which field |
| Disk write fails (permissions, out of space) | 500, logged server-side, generic error to the client |

## Testing

- Unit tests for `documentStore.js`: save produces a retrievable file with a stable hash; reading back an id that doesn't exist returns `null`; two different files produce different hashes (basic sanity, not a cryptography test).
- Route-level test (or manual `curl -F` verification, consistent with how this codebase has tested routes so far) for `/api/relationships/pdf`: a real small PDF fixture uploads successfully and produces a relationship in the exact shape the Review step (Step 2) already knows how to render — this is the key compatibility check, since Step 2 must not need to know or care that this relationship came from a PDF rather than a chat export.
- Manual end-to-end: upload a PDF, fill the terms form, walk through Steps 2-5 exactly as with the existing WhatsApp demo path, confirm nothing downstream needed to change.

## Out of scope (explicit)

- No PDF parsing/OCR/automatic clause or terms extraction — terms are manually entered by the owner alongside the upload.
- No PDF preview/rendering in the Review step beyond a link to download/view the uploaded file — a full in-browser PDF viewer is a nice-to-have, not required for this sub-project's scope.
- No virus/malware scanning of uploaded files — acceptable for a local-demo prototype, would be a real requirement before any production deployment accepting arbitrary uploads.
- No change to `contractGenerator.js` or anything downstream of relationship creation.
