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

The site is at https://zacaddons.com/ (registered at Porkbun). Porkbun points
the domain at Cloudflare's nameservers; Cloudflare holds the DNS records and
sits in front of GitHub Pages (encryption "Full", http goes to https). The
`CNAME` file in this repository tells GitHub to serve the site there. The old
https://zac175.github.io/ address forwards to the new one, so links in older
addon versions keep working. Don't delete `CNAME`.

Google: the domain is verified in Google Search Console (a TXT record at
Cloudflare; don't delete it) and `sitemap.xml` lists the pages.

## The admin panel

https://zacaddons.com/admin/ - for Zac only. Inbox of every report and
suggestion, stats, release check, editing the site without GitHub Desktop, and
the sign-in history. It is not linked from anywhere and search engines are told
to stay out.

It runs on a small Cloudflare Worker, `zacaddons-admin` (source:
`extras/admin-worker.js`), on the routes `zacaddons.com/api/*` and
`zacaddons.com/admin/api/*`, with a D1 database (`DB`) and a KV store for
screenshots (`FILES`). Sign-in is a password plus a code from an authenticator
app; the password is only stored as a one-way hash and nothing secret is in
this repository.

Setting it up (once):

1. Cloudflare > Workers & Pages > `zacaddons-admin` > Settings > Variables and
   Secrets > Add > type **Secret**, name `DISCORD_WEBHOOK`, value: your Discord
   webhook address. (Optional: `IDEAS_WEBHOOK` for suggestions in their own
   channel.)
2. GitHub > Settings > Developer settings > Fine-grained tokens > Generate:
   repository access "Only select repositories": Zac175.github.io, ZacUI,
   Readycheck, OldRaidFrames, StackedRaidGroups, WowTiler, MultiLauncher;
   permissions: Contents read and write, Issues read and write, Actions read.
   Add it to the worker the same way as step 1, name `GITHUB_TOKEN`.
3. Open https://zacaddons.com/admin/ and follow it: a code goes to Discord, you
   add the key to your authenticator app and pick a password.

Once the worker has the webhook, the site sends reports through it (so they
land in the inbox too) and `reportWebhook` in `config.js` can be emptied: the
address is then no longer public.

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
    extras/relay-worker.js   older optional relay (the admin worker does this now)
    extras/admin-worker.js   the site's server: reports, counting, the admin panel
    admin/                   the admin panel's page
    data/site.json           headline, intro line and notice, set from the admin panel
    robots.txt, sitemap.xml  for search engines

No build step, no libraries, no cookies. Page views and download clicks are
counted by the site's own worker without cookies and without keeping anything
about a visitor. The browser remembers a
half-written report and the last picks on the page, on that device only.
