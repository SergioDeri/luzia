# 07: Re-run with a per-section menu

**What to build:** An Owner who runs `luzia init` again sees what is already configured (Knowledge Base, luzIA variables in `.env.local`, route, widget) and picks from a menu — models and keys, Core, Instructions, widget, production variables — to change one thing without redoing the rest. Existing files are only overwritten after a diff and confirmation; changing the embeddings model triggers a rebuild so the server doesn't refuse to start.

**Blocked by:** 02 — Core drafted from the CV; 03 — Instructions by topic; 04 — Widget configuration; 06 — Production variables

**Status:** done

- [x] An existing setup is detected and summarised before the menu
- [x] Each menu entry runs only its section and leaves others untouched
- [x] Overwrites always show a diff and require confirmation
- [x] Changing the embeddings model rebuilds the Knowledge Base
- [x] Seam tests use an existing-setup fixture and cover each menu entry
