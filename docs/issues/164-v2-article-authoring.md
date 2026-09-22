v2 has a working article admin (create/edit/publish/schedule, hero image + focal
point, pin, notify-on-publish, view counts — shipped with #195). What's still
missing is **parity with v1's composition tooling**: v2's editor is a plain
markdown `<textarea>`, while v1 uses a full rich-text editor with inline media.

## Composition parity gaps (v1 → v2)

Ported from the #195 parity sweep. v1 references: `RichTextEditor.tsx`,
`ArticleImageDrawer.tsx`, `ArticleImagePicker.tsx`, `admin/ArticleManager.tsx`.

- **Rich-text (WYSIWYG) editor** — Tiptap-based, replacing the markdown textarea.
  Toolbar: H2/H3, bold, italic, underline, link, insert image/video, bullet list,
  horizontal rule. Must round-trip to the SAME stored format v2 already renders
  (markdown, with inline HTML for sized images + `<video>`), so existing content
  keeps working and the reader (rehype-raw + remark-breaks) renders it unchanged.
- **Insert image/video into the body** — a picker drawer: upload (client-side
  compressed, images + video) or reuse previously-uploaded article media. Needs a
  GET to list the org's article-bucket media, and the upload endpoint to accept
  video (currently images only).
- **Image resize control** — Small (33%) / Medium (66%) / Full (100%), serialized
  as inline `<img style="width:…">` (this is where legacy 33/66% images come from).
- **Author picker** — attribute an article to a member other than the poster
  (`author_id` override on create/edit; the API defaults to the poster today).
- **Admin-list pagination** — v2 returns/render all articles; page the list.

## Lower priority / separate

- **Gallery + song-art as image sources** — v1's hero-image picker can pull from
  the photo gallery and song artwork, not just direct upload. Distinct from the
  inline body-media drawer above; can land later.

## Acceptance

- An admin composes an article in a rich-text editor with formatted text, inline
  images (resizable) and video, attributes it to any member, and it renders
  identically in the reader. Existing (legacy-imported) articles still edit and
  render correctly.

Part of the Stories & Recognition epic (#173). Reader parity done in #195.
