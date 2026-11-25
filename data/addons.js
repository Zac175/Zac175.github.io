// The four addons this site covers. One entry each; the pages are built from
// this list, so adding an addon here adds it everywhere.
//   repo        its GitHub repository (releases and known problems are read from it)
//   curse       its CurseForge page
//   games       where it runs: era, tbc, forever, retail
//   code        the short tag at the front of a report's reference
//   commands    chat commands worth knowing (shown on the Help page)
window.ZAC_ADDONS = [
  {
    id: "zacui",
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
    ],
  },
  {
    id: "readycheck",
    name: "Readycheck",
    repo: "Readycheck",
    curse: "https://www.curseforge.com/wow/addons/ready-check",
    code: "RC",
    games: ["era", "tbc", "forever"],
    line: "The raid toolkit: reminders, consumables, gear and trinket swaps, world buffs, routes and time-to-kill.",
    version: "The addon list in game shows it in the name, like Readycheck 5.0.13.",
    commands: [
      ["/rc", "Open Readycheck."],
      ["/rc flavor", "Which features are on for the game version you are playing."],
      ["/wb", "The world buff tracker for you and your other characters."],
    ],
  },
  {
    id: "defaultframes",
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
    ],
  },
  {
    id: "stacked",
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
    ],
  },
];
