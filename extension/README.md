# Chrome extension starter

This Manifest V3 extension provides a Google Docs side panel that captures visible document context and sends it to the Railway API at `/api/document-review`.

## Local install

1. Start the API with `pnpm dev:api` from the repository root, or run the FastAPI command in `apps/api`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer Mode.
4. Choose **Load unpacked** and select the `extension` directory.
5. Open a Google Doc, click the extension icon, and run a review.

The current DOM extraction is intentionally conservative. The next production step is to add Google OAuth and Google Docs API ingestion so the extension can review the full document reliably instead of relying only on visible DOM text.
