# Zac's addons: the site

The page players use to get the newest version of ZacUI, Readycheck,
DefaultFrames, Stacked Raid Groups, WowTiler and MultiLauncher, see what changed since the version they
have, report a problem and suggest a feature. Reports go to Discord.

Live at https://zacaddons.com/

## The one file you edit

`config.js`. It says where reports go (your Discord webhook), whether that
channel is a forum channel, whether to ping you, and how players reach you.
Open `owner.html` on the live site (https://zacaddons.com/owner.html) to
test a webhook and get the exact lines to paste.

After any change: save, commit and push in GitHub Desktop. The site updates
about a minute later.

## The address

The site is at https://zacaddons.com/ (registered at Porkbun). The `CNAME` file
in this repository tells GitHub to serve it there, and Porkbun's DNS has an
ALIAS record for `zacaddons.com` and a CNAME for `www` pointing at
`zac175.github.io`. The old https://zac175.github.io/ address forwards to the new
one, so links in older addon versions keep working. Don't delete `CNAME`.

## What keeps itself up to date

- **Versions and what changed.** Read from each addon's GitHub releases every
  time someone opens the page. A release you push shows up without touching
  this repository.
- **Suggestions on the list.** Any open issue with the label `idea` shows on
  the Suggestions page.
- **Known problems.** Open issues you wrote yourself in one of the four addon
  repositories, plus anyone's issue that carries the label `known`. Close the
  issue and it leaves the site.

## What is built in

`data/changelog.js` is the full version history as of the day it was built,
with the per-game marks (which lines are for Classic Era, WoW Forever and so
on). GitHub's release text does not carry those marks, so releases newer than
this file show without them until it is rebuilt.

The colours are the addons' own (ZacUI's `Core_Colors.lua`), named at the top
of `assets/site.css`; the icons in `assets/icons/` are the files the addons,
WowTiler and MultiLauncher ship, as PNG.

`data/addons.js` is the list of addons: names, links, the commands on the Help
page. Add an entry there and the addon appears on every page.

## Files

    index.html            the pages (Addons, What changed, Report / Suggestions, Help)
    owner.html            webhook test and upkeep notes, for Zac
    config.js             the settings
    assets/site.css       the look
    assets/site.js        everything the pages do
    assets/fonts/         Marcellus and Alegreya Sans (SIL Open Font License, texts alongside)
    data/                 the addon list and the built-in history
    extras/relay-worker.js   optional: hides the webhook address behind a relay

No build step, no libraries, no tracking, no cookies. The browser remembers a
half-written report and the last picks on the page, on that device only.
