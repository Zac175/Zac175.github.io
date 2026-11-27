// What this site covers: the four addons, WowTiler and MultiLauncher. One entry each; the
// pages are built from this list, so adding one here adds it everywhere.
//   repo        its GitHub repository (releases and known problems are read from it)
//   curse       its CurseForge page
//   games       where it runs: era, tbc, forever, retail
//   code        the short tag at the front of a report's reference
//   commands    chat commands worth knowing (shown on the Help page)
//   icon        the addon's own icon, as it ships (assets/icons)
//   kind        "app" for a Windows program: no CurseForge page and no game
//               versions; its download is the newest GitHub release
//   errorHint   (a program) what to paste into a report, shown under the error box
//   feed        "repo" for a program without releases: its newest build is the exe on
//               the main branch and its history is CHANGELOG.md there, so a push to
//               the repository is all it takes for this site to show a new version
//   links       extra links on its row: [text, address]
window.ZAC_ADDONS = [
  {
    id: "zacui",
    icon: "assets/icons/zacui.png",
    name: "ZacUI",
    repo: "ZacUI",
    curse: "https://www.curseforge.com/wow/addons/zacui",
    code: "ZUI",
    games: ["era", "tbc", "forever", "retail"],
    line: "A complete interface: unit frames, nameplates, bars, bags, meter, class HUDs, raid mods and maps.",
    version: "Click the ZacUI minimap button: its menu has the version at the top. The changelog in the settings (/zacui) shows it too.",
    commands: [
      ["/zacui", "Open the settings. /zui does the same."],
      ["/zacui flavor", "What works differently on the game version you are playing."],
      ["/zui timers", "What the pull and break timers asked for and heard. Send this when a timer bar did not show."],
      ["/zui perf", "What ZacUI is costing you right now."],
      ["/zui macros", "The macro cleaner."],
      ["/zui report", "A link to the report form on this site, with your version and game filled in. /zui suggest does the same for an idea."],
    ],
  },
  {
    id: "readycheck",
    icon: "assets/icons/readycheck.png",
    name: "Readycheck",
    repo: "Readycheck",
    curse: "https://www.curseforge.com/wow/addons/ready-check",
    code: "RC",
    games: ["era", "tbc", "forever"],
    line: "The raid toolkit: reminders, consumables, gear and trinket swaps, world buffs, routes and time-to-kill.",
    version: "The addon list in game shows it in the name, like Readycheck 5.0.14.",
    links: [["Route planner", "https://zac175.github.io/readycheck-routes/"]],
    commands: [
      ["/rc", "Open Readycheck."],
      ["/rc flavor", "Which features are on for the game version you are playing."],
      ["/wb", "The world buff tracker for you and your other characters."],
      ["/rc report", "A link to the report form on this site, with your version and game filled in. /rc suggest does the same for an idea."],
    ],
  },
  {
    id: "defaultframes",
    icon: "assets/icons/defaultframes.png",
    name: "DefaultFrames",
    repo: "OldRaidFrames",
    curse: "https://www.curseforge.com/wow/addons/defaultframes",
    code: "DF",
    games: ["era", "tbc", "forever", "retail"],
    line: "The old Classic raid frames, rebuilt for the new client. In your AddOns folder it is called OldRaidFrames.",
    version: "Type /orf. The top of the options panel reads OldRaidFrames and the version.",
    commands: [
      ["/orf", "Open the options."],
      ["/orf unlock", "Unlock the frames so you can drag them."],
      ["/orf profile", "The profile manager."],
      ["/orf help", "Every command it has."],
      ["/orf report", "A link to the report form on this site, with your version and game filled in. /orf suggest does the same for an idea."],
    ],
  },
  {
    id: "stacked",
    icon: "assets/icons/stacked.png",   // (it ships without one: this is ZacUI's raid frames glyph)
    name: "Stacked Raid Groups",
    repo: "StackedRaidGroups",
    curse: "https://www.curseforge.com/wow/addons/stacked-raid-groups",
    code: "SRG",
    games: ["era", "tbc", "forever"],
    line: "Stacks the new raid frames' groups into rows, so 40 players do not stretch across the screen.",
    version: "Type /srg status. The first line is the version you have.",
    commands: [
      ["/srg", "Open the options."],
      ["/srg status", "What the addon is doing right now, and its version. Paste this into a report."],
      ["/srg guard", "What the combat guard does, and how to switch it off."],
      ["/srg report", "A link to the report form on this site, with your version and game filled in. /srg suggest does the same for an idea."],
    ],
  },
  {
    id: "wowtiler",
    icon: "assets/icons/wowtiler.png",
    kind: "app",
    name: "WowTiler",
    repo: "WowTiler",
    curse: "",
    code: "WT",
    games: [],
    line: "A small Windows app that tiles your WoW clients on one monitor or two, keeps every window 16:9, and swaps any client into the main slot with a Shift+click or a hotkey. It only moves and resizes windows.",
    version: "The window's title bar reads WoW Window Tiler and the version.",
    errorHint: "WowTiler writes WowTiler.log next to the exe. Paste what is in it here.",
    commandsTitle: "WowTiler's keys",
    commands: [
      ["Shift + click an alt", "It becomes the main. The key can be changed."],
      ["Ctrl+Alt+Right / Left", "The next or previous client becomes the main."],
      ["Ctrl+Alt+1 ... 9", "That slot becomes the main."],
      ["Ctrl+Alt+Home", "Tile everything again."],
      ["Ctrl+Alt+End", "Raid mode on or off: the main full-monitor and borderless."],
    ],
  },
  {
    id: "multilauncher",
    icon: "assets/icons/multilauncher.png",
    kind: "app",
    name: "MultiLauncher",
    repo: "MultiLauncher",
    feed: "repo",
    curse: "",
    code: "ML",
    games: [],
    line: "A small Windows app that opens all your Battle.net accounts at once, each in its own launcher window, already signed in. Emails and passwords are stored encrypted. It never touches the game.",
    version: "Open Options in MultiLauncher. The version is at the bottom, next to Clean up old versions.",
    errorHint: "In MultiLauncher, open the Log section and paste what it shows here. It names no account.",
    commandsTitle: "MultiLauncher's buttons",
    commands: [
      ["Launch all", "Opens every account in your list and ticks each one off as it comes up."],
      ["Import from Battle.net", "Adds the accounts Battle.net already remembers."],
      ["Desktop shortcut", "Makes a shortcut that closes open launchers and reopens every account."],
      ["Options, then Look", "Dark or light windows."],
      ["Options, then Undo B.net changes", "Puts Battle.net's own settings file back to an earlier copy."],
    ],
  },
];
