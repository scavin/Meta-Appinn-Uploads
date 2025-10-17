Appinn Uploads Plugin TODO
==========================

- [x] Confirm site settings to expose (auth code, upload channel, server compress, name type, auto retry, debug).
- [x] Scaffold plugin structure:
  - `plugin.rb` with metadata, site settings, assets registration.
  - `config/locales/server.zh_CN.yml` for site setting labels.
  - Frontend assets under `assets/javascripts/discourse/`.
- [x] Implement frontend initializer (`initializers/appinn-upload.js`) using `withPluginApi` to hook composer events and set `data-appinn-uploader="plugin"` on `document.body`.
- [x] Build uploader module (`lib/appinn-uploader.js`) handling:
  - Editor adapter abstraction for textarea and ProseMirror.
  - Placeholder insertion/replacement mirroring current Markdown output.
  - Upload logic calling `https://h1.appinn.me/upload` with site settings.
- [x] Override paste, drop, and toolbar upload button behaviors to use the new uploader; ensure retry/error handling matches existing script.
- [x] Document installation and migration steps, including instructing users to disable the old userscript.
