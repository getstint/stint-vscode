export enum EditorId {
  VsCode = "vscode",
  Cursor = "cursor",
  Windsurf = "windsurf",
  VsCodium = "vscodium",
  Kiro = "kiro",
  Trae = "trae",
}

export function editorFromAppName(appName: string): EditorId {
  const name = appName.toLowerCase();
  if (name.includes("cursor")) return EditorId.Cursor;
  if (name.includes("windsurf")) return EditorId.Windsurf;
  if (name.includes("vscodium")) return EditorId.VsCodium;
  if (name.includes("kiro")) return EditorId.Kiro;
  if (name.includes("trae")) return EditorId.Trae;
  return EditorId.VsCode;
}

export const userAgent = (editor: EditorId, editorVersion: string, extensionVersion: string) =>
  `stint-vscode/${extensionVersion} (${process.platform}-${process.arch}) ${editor}/${editorVersion} vscode-stint/${extensionVersion}`;

export const installCommand = (platform: NodeJS.Platform) =>
  `${platform === "win32" ? "npx.cmd" : "npx"} --yes getstint@latest install`;
