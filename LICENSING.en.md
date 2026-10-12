# Licensing

[简体中文](LICENSING.md) | **English**

Copyright (c) 2026 _connlost (GitHub: [KrisCris](https://github.com/KrisCris))

This is a translation. If it differs from the [Chinese version](LICENSING.md), the Chinese version prevails.

Village in the Shade Wiki is open source, and you are welcome to use it, change it and contribute. Code and content are licensed separately:

| Part | License | In short |
| --- | --- | --- |
| Code: source code, styles, scripts, extractor, tests, build configuration | [GNU AGPL-3.0](LICENSE) (version 3.0 only), with the additional terms below | Use and modify it freely. If you deploy a modified version publicly, publish its source under the same license and keep the author credit |
| Content: guide and explanatory text, translations, documentation, data verification notes, and the author's curation, linking and annotation of game data | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | Repost and adapt it with credit and a link to the original, not for commercial use, and share adaptations under the same license |
| Game assets and game data | Not licensed by this project | They belong to Nippon Ichi Software, Inc. and other rights holders; see below |

Where one file holds both code and page text (for example `.astro` pages and the translations in `src/i18n/catalogs/`), the code is under AGPL and the text under CC BY-NC-SA.

## What you can do

Without asking the author, you can:

- browse the site and use what it says in your play, videos, streams and discussions;
- fork the repository, and run, study and modify the code;
- open issues and pull requests;
- repost or adapt guide content for non-commercial use, with the attribution below;
- deploy your own modified version under AGPL and the additional terms.

## Attribution for reposted content

When you repost or adapt guides, data curation or translations, put this at the start or end of the text:

> Source: [静谧田园 Wiki](https://kriscris.github.io/village-in-the-shade-guide/) (by _connlost), link to the original page, licensed under CC BY-NC-SA 4.0

Link the specific page, not just the home page. Say what you changed if you adapted it. Don't present it as your own work or as "collected from the internet".

Commercial use needs the author's written permission first. That includes pages, apps, videos and compilations with ads, paywalls, memberships or traffic funnels, and use as part of a paid service or product. To ask for permission, open an issue on GitHub.

## Additional terms for the code

Under section 7 of AGPL-3.0, the author adds these terms to the author's code:

1. **Keep the credit.** A site that deploys this project or a modified version must show the author credit _connlost and a link to this repository in a visible place on every page, such as the footer (section 7(b)).
2. **Mark modified versions.** A publicly released modified version must say that it is a modified version of this project, and must not claim or imply that it is the original site, the original author or an official version (section 7(c)).
3. **The name is not licensed.** This license grants no right to use the site name "静谧田园 Wiki". Modified versions must use their own name (section 7(e)).

Under section 13 of AGPL, anyone deploying a modified version must let visitors get its complete source code. The guide text in a modified version is still under CC BY-NC-SA, so a mirror with ads or a paywall is not allowed even if it publishes its code.

## Contributions

By opening a pull request, you confirm that you have the right to submit the changes and agree that they are released under the license for that part of the project: code under AGPL-3.0 with the additional terms above, text and translations under CC BY-NC-SA 4.0. You keep the copyright in your contribution, and the commit history keeps your name.

## Game assets and data

The names, text, images, audio, characters and data of *Village in the Shade / ほの暮しの庭 / 静谧田园* belong to Nippon Ichi Software, Inc. and other rights holders. The icons, maps, scenery and portraits extracted from the game, the logo published on the Steam store, and the character portraits published on the publisher's website are shown here only for reference in an unofficial guide. The author claims no rights in them, and this project's licenses grant nobody any right to use them. If a rights holder asks for something to be changed or removed, open an issue on GitHub and the author will deal with it promptly. Sources are listed in [assets](docs/assets.en.md).

`tests/fixtures/gamesave.tar.gz.enc` is the author's encrypted test save and is not covered by any license.

Dependencies are used under their own licenses; see `package-lock.json` and `uv.lock`.

## Disclaimer

This project is provided as is, without any warranty. Game data, guides and calculations may be wrong or become outdated after game updates. The save editor may corrupt a save or produce results that differ from the game's own behavior, so back up your saves first. Editing a save may affect achievements, progress and your experience of the game. To the extent permitted by law, the author is not liable for any loss caused by using this project.
