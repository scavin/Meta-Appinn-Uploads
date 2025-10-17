Appinn Forum Upload Enhancer (Discourse Plugin)
==============================================

This plugin replaces Discourse’s built-in upload flow and routes every file paste, drag/drop, or toolbar upload button action to the Appinn image hosting service (`h1.appinn.me`). It keeps the original userscript behaviour— inserting Markdown placeholders during upload, replacing them with the final resource URLs, and showing failure messages on error— while integrating directly into the Discourse composer (both the classic Markdown textarea and the new rich-text composer). The result works consistently on desktop and mobile without depending on a browser userscript.

Key Features
------------
- Intercepts paste, drag-and-drop, and upload button events in the composer.
- Uploads files to `https://h1.appinn.me/upload` using the same parameters as the userscript.
- Inserts Markdown links for images, audio, video, and PDFs; reports errors with inline placeholders.
- Transparently supports both textarea (legacy) and ProseMirror (rich-text) composer modes.
- Provides site settings so administrators can adjust upload behaviour without editing code.
- Sets a `data-appinn-uploader="plugin"` attribute on the `<body>` element so the legacy userscript can detect and disable itself, avoiding conflicts.

Installation
------------
1. Place this repository inside your Discourse installation’s `plugins/` directory (e.g. `/var/discourse/shared/standalone/plugins/appinn-forum-upload-enhancer`).
2. Rebuild the Discourse container:
   ```bash
   ./launcher rebuild app
   ```
3. After the rebuild completes, log in as an administrator and visit **Admin → Settings → Plugins**.
4. Search for “Appinn upload” to review and adjust the site settings (see the next section).

Configuration
-------------
All behaviour is controlled through standard site settings; no code changes are required.

| Setting | Description | Default |
| --- | --- | --- |
| `appinn_upload_endpoint` | Upload endpoint (usually `https://h1.appinn.me/upload`). | `https://h1.appinn.me/upload` |
| `appinn_upload_assets_prefix` | Prefix prepended to `src` values returned by the endpoint. | `https://h1.appinn.me` |
| `appinn_upload_auth_code` | Required auth code for uploads. | _empty_ |
| `appinn_upload_api_token` | Optional API Token; if set, sent as `Authorization: Bearer …`. | _empty_ |
| `appinn_upload_channel` | Upload channel (`telegram`, `cfr2`, `s3`). | `telegram` |
| `appinn_upload_server_compress` | Enable server-side compression. | `false` |
| `appinn_upload_name_type` | Filename strategy (`default`, `index`, `origin`, `short`). | `default` |
| `appinn_upload_auto_retry` | Allow the server to auto-retry on failures. | `true` |
| `appinn_upload_return_format` | Response format (`default` for `/file/id`, `full` for absolute URLs). | `default` |
| `appinn_upload_folder` | Optional subfolder path (e.g. `img/test`). | _empty_ |
| `appinn_upload_max_file_size_mb` | Maximum allowed file size in megabytes. | `20` |
| `appinn_upload_debug` | Enable console logging for debugging. | `false` |

Once the relevant settings are populated (provide at least an auth code or API token), the plugin takes over uploads automatically.

Migration From the Userscript
-----------------------------
If community members previously installed the “Appinn Forum Upload Enhancer” userscript, remind them to disable or remove it after the plugin is deployed. The plugin sets `document.body.dataset.appinnUploader = "plugin"` so the latest userscript can detect the plugin and exit early, but removing the userscript avoids duplicate uploads on older copies.

Troubleshooting
---------------
- **Uploads still go to Discourse storage**: double-check that the plugin is enabled and the auth code is set correctly. A missing auth code causes the external service to reject requests.
- **Nothing happens on paste/drag**: confirm that `document.body.dataset.appinnUploader` equals `plugin`. If not, verify the plugin assets are compiling (`rails r "Stylesheet::Compiler.compile"` or check the browser console for build errors).
- **Console shows CORS errors**: ensure the Appinn upload endpoint allows requests from your forum origin.
- **Need to fall back temporarily**: remove the plugin directory or disable it, then rebuild the container; the userscript can be re-enabled if necessary.

Development Notes
-----------------
- Front-end logic lives under `assets/javascripts/discourse/`.
- `plugin.rb` registers the assets and exposes site settings defined in `config/settings.yml`.
- Run Discourse’s front-end development server (`bin/ember-cli`) to iterate on the JavaScript if needed.
- Remember to update `todo.md` and the documentation when behaviour changes.
