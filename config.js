// ---------------------------------------------------------------------------
//  SETTINGS FOR THE SITE  -  the only file you ever need to edit by hand.
//  After a change: save, then commit and push (GitHub Desktop). The site
//  updates about a minute later.
// ---------------------------------------------------------------------------
window.SITE_CONFIG = {

  // WHERE REPORTS GO.
  // Paste your Discord webhook address between the quotes. Until you do,
  // the "Report a problem" page still works: it hands the player the report
  // text to copy and send to you.
  //   Discord > your server > Server Settings > Integrations > Webhooks >
  //   New Webhook > pick the channel > Copy Webhook URL
  // owner.html (open it from the site: /owner.html) checks the address and
  // sends a test message before you save it here.
  reportWebhook: "",

  // Is that channel a FORUM channel? Then every report becomes its own post
  // (a thread you can answer, tag and close). true or false.
  reportsAreForumPosts: false,

  // Want a real ping for every report? Put your Discord user ID here
  // (Discord > Settings > Advanced > Developer Mode on, then right-click
  // your name > Copy User ID). Leave empty for no ping.
  pingUserId: "",

  // HOW PLAYERS REACH YOU.
  discordName: "Zac12",                        // shown as "Zac12 on Discord"
  discordInvite: "",                           // a server invite link, if you have one
  twitch: "https://twitch.tv/zac984",

  // Your GitHub user name: where the site reads new releases from.
  githubUser: "Zac175",
};
