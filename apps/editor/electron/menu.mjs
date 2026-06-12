import { app, Menu } from "electron";
import { resolveIconPath } from "./icon.mjs";

export function setupMacApplicationMenu(appName, clientRoot) {
  if (process.platform !== "darwin") return;

  const iconPath = resolveIconPath(clientRoot);
  app.setAboutPanelOptions({
    applicationName: appName,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: "Copyright © Blackbox",
    ...(iconPath ? { iconPath } : {}),
  });

  const template = [
    {
      label: appName,
      submenu: [
        {
          label: `About ${appName}`,
          click: () => app.showAboutPanel(),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
