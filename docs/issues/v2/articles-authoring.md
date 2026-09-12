v2 can **display** articles (home featured card, `/new/[slug]/articles` list,
reading page) but there is **no v2 authoring/editing UI**. Current v2 articles
came from the import/seed; the admin "Articles" tile is a stub.

## Scope
- v2 admin article editor (create/edit/publish/schedule, image + focal point, markdown body), writing `v2_articles`.
- Wire the group-admin "Articles" tile to it.

## Acceptance
- An admin can write, edit, schedule, and publish an article that appears on the home feed + articles list.

_Deferred; read-side shipped, write-side not._
