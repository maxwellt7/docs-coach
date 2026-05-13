# Google Cloud + OAuth setup for Docs Coach

The Insert and Post comment actions call the Google Docs API and the
Google Drive Comments API directly from the Chrome extension. To
authorize those calls you need a Google Cloud project, an OAuth client
ID of type **Chrome Extension**, and the client ID pasted into the
extension's `manifest.json`.

These scopes (`documents` and `drive`) are "restricted" by Google. For
**personal use** the unverified-app warning is fine — you click
**Advanced → Continue (unsafe)** the first time. For wider distribution
through the Chrome Web Store you would need to submit for verification
later; that is out of scope for this round.

## Steps

1. **Get your extension ID.**
   Load the unpacked extension at `chrome://extensions`. Copy the
   32-char ID shown on the Docs Coach card.

2. **Create a Cloud project.**
   Open <https://console.cloud.google.com>, create a new project named
   `docs-coach` (any name works). Make sure it's selected in the
   project picker at the top.

3. **Enable APIs.**
   APIs & Services → Enabled APIs & services → **+ Enable APIs and
   Services**. Enable:
   - **Google Docs API**
   - **Google Drive API**

4. **Configure the OAuth consent screen.**
   APIs & Services → OAuth consent screen → **External** → Create.
   - App name: `Docs Coach`
   - User support email: your email
   - Developer contact email: your email
   - Save and continue.
   On the **Scopes** step click **Add or remove scopes** and add:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
   Save. On the **Test users** step add your own Google account.

5. **Create the OAuth client ID.**
   APIs & Services → Credentials → **+ Create Credentials → OAuth
   client ID**. Application type: **Chrome Extension**. Item ID: the
   32-char extension ID from step 1. Save.

6. **Copy the client ID into the manifest.**
   In `extension/manifest.json`, replace the placeholder in the
   `oauth2` block:

   ```json
   "oauth2": {
     "client_id": "<paste-here>.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/documents",
       "https://www.googleapis.com/auth/drive"
     ]
   }
   ```

7. **Reload the unpacked extension** at `chrome://extensions` so the
   new manifest is picked up.

8. **Sign in.**
   Open the side panel and click **Sign in to Google**. The first
   sign-in shows "Google hasn't verified this app." Click
   **Advanced → Continue (unsafe)**, then **Allow** on the scopes. Your
   email should now appear in the auth row.

## Troubleshooting

- **"OAuth2 not granted or revoked"** in the console after clicking
  Sign in. Usually means the extension ID in the Cloud console
  doesn't match the one Chrome loaded. Verify both, update the Cloud
  console if needed, and reload the extension.
- **403 on Insert / Post comment.** The scope was probably not added
  to the consent screen. Update step 4 then sign out and sign in
  again from the side panel — Chrome will re-prompt for consent.
- **"redirect_uri_mismatch"**. You probably created a Web client
  instead of a Chrome Extension client. Recreate the credentials
  with type **Chrome Extension**.
- **Need to start over?** APIs & Services → Credentials → delete the
  OAuth client, then repeat step 5.
