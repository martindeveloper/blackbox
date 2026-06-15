// Guided-tour documents for optional example scaffolding (see projectScaffold.js).

export function exampleSecondChapterId(firstChapterId) {
  return firstChapterId === "two" ? "second" : "two";
}

export function exampleScenarioDoc({
  title,
  firstChapterId,
  firstChapterTitle,
  introRef,
  secondChapterId,
  secondRef,
  libraryRef,
  cookRef,
}) {
  return {
    spec: "com.blackbox.scenario",
    formatVersion: 1,
    title,
    revision: "1.0",
    randomSeed: Math.floor(Math.random() * 65536),
    defaultStats: { resolve: 2, insight: 2 },
    itemsRef: "items.json",
    charactersRef: "characters.json",
    assetsRef: "assets.json",
    catalogRef: "catalog.json",
    libraryRef,
    cookRef,
    chapters: [
      { id: firstChapterId, title: firstChapterTitle, ref: introRef },
      { id: secondChapterId, title: "Chapter Two", ref: secondRef },
    ],
  };
}

export function exampleIntroChapterDoc({ id, title, secondChapterId }) {
  const n = (suffix) => `${id}_${suffix}`;
  return {
    spec: "com.blackbox.chapter",
    formatVersion: 1,
    id,
    title,
    startNodeId: n("start"),
    nodes: {
      [n("start")]: {
        id: n("start"),
        title,
        onEnter: [{ type: "addEvent", eventId: "arrived" }],
        text: [
          {
            kind: "stage_direction",
            text: "A small room. One door. Stage directions like this set the scene.",
          },
          {
            kind: "paragraph",
            text: "Each block here is a text block. This is a paragraph. The choices below move the story to another node.",
          },
          {
            kind: "dialogue",
            speaker: "guide",
            side: "left",
            text: "Welcome. I'll point things out as we go — pick an option to continue.",
          },
        ],
        choices: [
          {
            id: "look",
            label: "Search the room.",
            effects: [{ type: "setFlag", flag: "explored", value: true }],
            goto: n("desk"),
          },
          { id: "door", label: "Go straight to the door.", goto: n("door") },
        ],
      },
      [n("desk")]: {
        id: n("desk"),
        title: "The Desk",
        text: [
          {
            kind: "paragraph",
            when: { type: "hasFlag", flag: "explored", value: true },
            text: "Because you searched, the 'explored' flag is set — a 'when' condition reveals this line.",
            else: "This alternate line shows when that flag is not set.",
          },
          {
            kind: "paragraph",
            text: "A keycard sits on the desk. Take it to see how items and the inventory work.",
          },
        ],
        choices: [
          {
            id: "take",
            label: "Take the keycard.",
            effects: [{ type: "addItem", itemId: "keycard", count: 1 }],
            goto: n("door"),
          },
          { id: "leave", label: "Leave it and go to the door.", goto: n("door") },
        ],
      },
      [n("door")]: {
        id: n("door"),
        title: "The Door",
        text: [
          {
            kind: "paragraph",
            text: "The door is locked. A choice can 'require' an item or stat — when unmet it stays visible but disabled, showing its reason.",
          },
        ],
        choices: [
          {
            id: "unlock",
            label: "Unlock the door with the keycard.",
            requires: { type: "hasItem", itemId: "keycard" },
            disabledReason: "You need the Access Keycard.",
            goto: n("ready"),
          },
          { id: "force", label: "Force the door open instead.", goto: n("ready") },
        ],
      },
      [n("ready")]: {
        id: n("ready"),
        title: "Onward",
        onEnter: [{ type: "modifyStat", stat: "resolve", amount: 1 }],
        text: [
          {
            kind: "thought",
            speaker: "player",
            side: "right",
            text: "That's one chapter. Arriving here raised Resolve by 1. Next: skill checks and endings.",
          },
        ],
        choices: [
          {
            id: "continue",
            label: "Continue to Chapter Two.",
            action: {
              type: "gotoChapter",
              chapterId: secondChapterId,
              nodeId: `${secondChapterId}_start`,
            },
          },
        ],
      },
    },
  };
}

export function exampleSecondChapterDoc({ id, introChapterId }) {
  const m = (suffix) => `${id}_${suffix}`;
  return {
    spec: "com.blackbox.chapter",
    formatVersion: 1,
    id,
    title: "Chapter Two",
    startNodeId: m("start"),
    nodes: {
      [m("start")]: {
        id: m("start"),
        title: "Chapter Two",
        text: [
          {
            kind: "paragraph",
            text: "A new chapter is just another file. A choice can roll a skill check against one of your stats.",
          },
        ],
        choices: [
          {
            id: "check",
            label: "Attempt a Resolve check.",
            check: {
              stat: "resolve",
              difficulty: 8,
              label: "Steady your nerve",
              onSuccess: {
                effects: [{ type: "modifyStat", stat: "insight", amount: 1 }],
                goto: m("after"),
              },
              onFailure: { goto: m("after") },
            },
          },
          { id: "skip", label: "Skip the check.", goto: m("after") },
        ],
      },
      [m("after")]: {
        id: m("after"),
        title: "Two Paths",
        text: [
          {
            kind: "paragraph",
            text: "A run can end two ways: a game-over node and an ending node. Try either — endings offer a restart.",
          },
        ],
        choices: [
          { id: "danger", label: "Take the dangerous path.", goto: m("over") },
          { id: "finish", label: "Walk out and finish.", goto: m("end") },
        ],
      },
      [m("over")]: {
        id: m("over"),
        title: "Game Over",
        mode: "game_over",
        text: [
          { kind: "stage_direction", text: 'Signal lost. This node uses mode: "game_over".' },
          {
            kind: "paragraph",
            text: "Game-over nodes end the run. Offer the player a way back below.",
          },
        ],
        choices: [
          {
            id: "retry",
            label: "Return to the start of this chapter.",
            action: { type: "restartGame", startNodeId: m("start") },
          },
          { id: "menu", label: "Return to the main menu.", action: { type: "openMainMenu" } },
        ],
      },
      [m("end")]: {
        id: m("end"),
        title: "The End",
        mode: "ending",
        text: [
          {
            kind: "paragraph",
            text: 'You reached an ending (mode: "ending"). Replace this with your own story and grow outward from here.',
          },
        ],
        choices: [
          {
            id: "again",
            label: "Play again from the first chapter.",
            action: { type: "restartGame", startNodeId: `${introChapterId}_start` },
          },
          { id: "menu", label: "Return to the main menu.", action: { type: "openMainMenu" } },
        ],
      },
    },
  };
}

export function exampleItemsDoc() {
  return {
    spec: "com.blackbox.items",
    formatVersion: 1,
    items: {
      keycard: {
        id: "keycard",
        name: "Access Keycard",
        description:
          "A blank keycard. Items appear in the player's inventory and can gate choices via 'requires'.",
        examineText: "Edges worn smooth. No label.",
      },
    },
  };
}

export function exampleCharactersDoc() {
  return {
    spec: "com.blackbox.characters",
    formatVersion: 1,
    characters: {
      guide: {
        id: "guide",
        name: "The Guide",
        subtitle: "Orientation",
        color: "#6da9ff",
      },
    },
  };
}

export function exampleMetaCatalogDoc() {
  return {
    spec: "com.blackbox.catalog",
    formatVersion: 1,
    events: {
      arrived: {
        title: "Arrived",
        description:
          "Recorded when the player enters the opening room. Events mark story beats for the journal and conditions.",
        internal: false,
      },
    },
    flags: {
      explored: {
        title: "Explored the room",
        description:
          "Set when the player searches the opening room. Flags are on/off (or valued) state you can branch on.",
        internal: false,
      },
    },
  };
}
