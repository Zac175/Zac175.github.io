# Zac's addons: the site

The page players use to get the newest version of ZacUI, Readycheck,
DefaultFrames and Stacked Raid Groups, see what changed since the version they
have, and report a problem. Reports go to Discord.

Live at https://zac175.github.io/

## The one file you edit

`config.js`. It says where reports go (your Discord webhook), whether that
channel is a forum channel, whether to ping you, and how players reach you.
Open `owner.html` on the live site (https://zac175.github.io/owner.html) to
test a webhook and get the exact lines to paste.

After any change: save, commit and push in GitHub Desktop. The site updates
about a minute later.

## What keeps itself up to date

- **Versions and what changed.** Read from each addon's GitHub releases every
  time someone opens the page. A release you push shows up without touching
  this repository.
- **Known problems.** Open issues you wrote yourself in one of the four addon
  repositories, plus anyone's issue that carries the label `known`. Close the
  issue and it leaves the site.

## What is built in

`data/changelog.js` is the full version history as of the day it was built,
with the per-game marks (which lines are for Classic Era, WoW Forever and so
on). GitHub's release text does not carry those marks, so releases newer than
this file show without them until it is rebuilt.

`data/addons.js` is the list of addons: names, links, the commands on the Help
page. Add an entry there and the addon appears on every page.

## Files

    index.html            the four pages (Addons, What changed, Report, Help)
    owner.html            webhook test and upkeep notes, for Zac
    config.js             the settings
    assets/site.css       the look
    assets/site.js        everything the pages do
    assets/fonts/         Marcellus and Alegreya Sans (SIL Open Font License, texts alongside)
    data/                 the addon list and the built-in history
    extras/relay-worker.js   optional: hides the webhook address behind a relay

No build step, no libraries, no tracking, no cookies. The browser remembers a
half-written report and the last picks on the page, on that device only.
