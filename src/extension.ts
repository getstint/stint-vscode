import * as vscode from "vscode";
import { editorFromAppName, userAgent, type EditorId } from "./editor";
import { isExcluded, projectForFile, relativeEntity } from "./project";
import { shouldSend, type Last } from "./schedule";
import {
  claimQueue,
  clientId,
  enqueue,
  machineName,
  normalizeApiUrl,
  readShared,
  request,
  StintError,
  writeShared,
  type Heartbeat,
} from "./stint";

const flushEveryMs = 30_000;
const todayEveryMs = 5 * 60_000;
const keySecret = "stint.apiKey";
const chunk = 500;

type DeviceCode = { device_code: string; user_code: string; expires_in: number; interval: number };

class Stint implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private pending: Heartbeat[] = [];
  private last: Last = null;
  private status: vscode.StatusBarItem;
  private editor: EditorId;
  private agent: string;
  private key: string | undefined;
  private flushing = false;
  private signingIn = false;
  private output: vscode.LogOutputChannel;

  constructor(private context: vscode.ExtensionContext) {
    this.editor = editorFromAppName(vscode.env.appName);
    this.agent = userAgent(this.editor, vscode.version, String(context.extension.packageJSON.version ?? "0.0.0"));
    this.output = vscode.window.createOutputChannel("Stint", { log: true });
    this.status = vscode.window.createStatusBarItem("stint.status", vscode.StatusBarAlignment.Left, 0);
    this.status.name = "Stint";
  }

  get apiUrl() {
    const setting = vscode.workspace.getConfiguration("stint").get<string>("apiUrl");
    return normalizeApiUrl(setting || process.env.STINT_API_URL || (readShared().apiUrl as string | undefined));
  }

  async start() {
    this.key = process.env.STINT_API_KEY ?? readShared().apiKey ?? (await this.context.secrets.get(keySecret));
    const on = <T>(event: vscode.Event<T>, handler: (value: T) => void) => this.disposables.push(event(handler));
    on(vscode.window.onDidChangeActiveTextEditor, (editor) => editor && this.track(editor.document, false));
    on(vscode.workspace.onDidChangeTextDocument, (event) => {
      if (event.contentChanges.length && vscode.window.activeTextEditor?.document === event.document)
        this.track(event.document, false);
    });
    on(vscode.workspace.onDidSaveTextDocument, (document) => this.track(document, true));
    on(vscode.window.onDidChangeTextEditorSelection, (event) => this.track(event.textEditor.document, false));
    on(vscode.window.onDidChangeWindowState, (state) => {
      if (!state.focused) void this.flush();
    });
    on(vscode.workspace.onDidChangeConfiguration, (event) => {
      if (event.affectsConfiguration("stint")) void this.refreshStatus();
    });
    const timers = [
      setInterval(() => void this.flush(), flushEveryMs),
      setInterval(() => void this.refreshStatus(), todayEveryMs),
    ];
    this.disposables.push({ dispose: () => timers.forEach(clearInterval) });

    const command = (id: string, handler: () => unknown) =>
      this.disposables.push(vscode.commands.registerCommand(id, handler));
    command("stint.signIn", () => this.signIn());
    command("stint.signOut", () => this.signOut());
    command("stint.openDashboard", () => vscode.env.openExternal(vscode.Uri.parse(`${this.apiUrl}/dashboard`)));
    command("stint.connectAgents", () => this.connectAgents());
    command("stint.showStatus", () => this.showStatus());
    command("stint.flush", () => this.flush(true));

    await this.refreshStatus();
    if (vscode.window.activeTextEditor) this.track(vscode.window.activeTextEditor.document, false);
    if (!this.key && !this.context.globalState.get("stint.welcomed")) {
      await this.context.globalState.update("stint.welcomed", true);
      const choice = await vscode.window.showInformationMessage(
        "Stint tracks your coding time. Sign in to start.",
        "Sign in",
        "Not now",
      );
      if (choice === "Sign in") await this.signIn();
    }
  }

  private track(document: vscode.TextDocument, isWrite: boolean) {
    if (!this.key) return;
    const config = vscode.workspace.getConfiguration("stint");
    const scheme = document.uri.scheme;
    if (scheme === "output" || scheme === "debug" || scheme === "vscode-settings") return;
    if (document.isUntitled && !config.get<boolean>("trackUntitled")) return;
    const path = document.uri.fsPath;
    if (scheme === "file" && isExcluded(path, config.get<string[]>("excludePatterns") ?? [])) return;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const project = scheme === "file" ? projectForFile(path, folder) : null;
    const entity = project ? relativeEntity(path, project.root) : null;
    const heartbeat: Heartbeat = {
      entity: entity ?? `${this.editor}:${document.languageId}`,
      type: entity ? "file" : "app",
      category: "coding",
      time: Date.now() / 1000,
      project: project?.name ?? vscode.workspace.name,
      branch: project?.branch,
      language: document.languageId,
      is_write: isWrite,
      editor: this.editor,
      machine: machineName(),
      lines: document.lineCount,
    };
    if (!shouldSend(this.last, heartbeat.entity, Date.now(), isWrite)) return;
    this.last = { entity: heartbeat.entity, at: Date.now() };
    this.pending.push(heartbeat);
    if (isWrite && this.pending.length >= 20) void this.flush();
  }

  async flush(manual = false) {
    if (this.flushing || !this.key) return;
    this.flushing = true;
    const fresh = this.pending.splice(0);
    enqueue(fresh);
    const claimed = claimQueue();
    try {
      if (!claimed?.items.length) {
        claimed?.done();
        if (manual) vscode.window.showInformationMessage("Nothing waiting to send.");
        return;
      }
      for (let index = 0; index < claimed.items.length; index += chunk) {
        try {
          await request(this.apiUrl, "/api/v1/heartbeats", {
            body: claimed.items.slice(index, index + chunk),
            token: this.key,
            userAgent: this.agent,
          });
        } catch (error) {
          if (
            error instanceof StintError &&
            (error.status === 0 || error.status === 401 || error.status === 429 || error.status >= 500)
          ) {
            claimed.release(claimed.items.slice(index));
            this.output.warn(`Queued activity for later: ${error.message}`);
            if (error.status === 401)
              this.setStatus(
                "$(warning) Stint",
                "Your Stint key stopped working. Click to sign in again.",
                "stint.signIn",
              );
            return;
          }
          this.output.error(
            `Stint rejected ${Math.min(chunk, claimed.items.length - index)} heartbeats: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      claimed.done();
      if (manual) vscode.window.showInformationMessage(`Sent ${claimed.items.length} heartbeats.`);
      void this.refreshStatus();
    } finally {
      this.flushing = false;
    }
  }

  private setStatus(text: string, tooltip: string, command: string) {
    this.status.text = text;
    this.status.tooltip = tooltip;
    this.status.command = command;
    if (vscode.workspace.getConfiguration("stint").get<boolean>("statusBar", true)) this.status.show();
    else this.status.hide();
  }

  private async refreshStatus() {
    if (!this.key)
      return this.setStatus("$(clock) Sign in to Stint", "Stint isn't tracking yet. Click to sign in.", "stint.signIn");
    try {
      const today = await request<{ data: { grand_total: { text: string; total_seconds: number } } }>(
        this.apiUrl,
        "/api/compat/wakatime/v1/users/current/statusbar/today",
        { token: this.key, userAgent: this.agent },
      );
      const total = today.data.grand_total;
      this.setStatus(
        `$(clock) ${total.total_seconds >= 60 ? total.text : "0 mins"}`,
        `Today on Stint: ${total.text || "nothing yet"}. Click for your dashboard.`,
        "stint.openDashboard",
      );
    } catch (error) {
      if (error instanceof StintError && error.status === 401)
        this.setStatus("$(warning) Stint", "Your Stint key stopped working. Click to sign in again.", "stint.signIn");
      else
        this.setStatus(
          "$(clock) Stint",
          "Tracking. Today's total will show once Stint is reachable.",
          "stint.showStatus",
        );
    }
  }

  private async signIn() {
    if (this.signingIn) return;
    this.signingIn = true;
    try {
      const apiUrl = this.apiUrl;
      const device = await request<DeviceCode>(apiUrl, "/api/auth/device/code", {
        body: { client_id: clientId, scope: "heartbeats usage" },
        userAgent: this.agent,
      });
      const code = `${device.user_code.slice(0, 4)}-${device.user_code.slice(4)}`;
      const link = vscode.Uri.parse(
        `${apiUrl}/device?user_code=${encodeURIComponent(device.user_code)}&client=${clientId}`,
      );
      await vscode.env.clipboard.writeText(code);
      const choice = await vscode.window.showInformationMessage(
        `Your Stint code is ${code} (copied). Approve it in the browser to connect this editor.`,
        { modal: false },
        "Open browser",
        "Copy link",
      );
      if (choice === "Copy link") await vscode.env.clipboard.writeText(link.toString());
      else if (choice === "Open browser") await vscode.env.openExternal(link);
      else if (choice === undefined) return;
      const token = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Waiting for you to approve ${code} in the browser…`,
          cancellable: true,
        },
        (_, cancel) => this.poll(apiUrl, device, cancel),
      );
      if (!token) return;
      const { key } = await request<{ key: string }>(apiUrl, "/api/v1/me/api-keys", {
        body: { name: `${machineName()} · ${vscode.env.appName}`.slice(0, 60) },
        token,
        userAgent: this.agent,
      });
      const me = await request<{ username: string; email: string }>(apiUrl, "/api/v1/me", {
        token: key,
        userAgent: this.agent,
      });
      await request(apiUrl, "/api/auth/sign-out", { body: {}, token, userAgent: this.agent }).catch(() => undefined);
      this.key = key;
      await this.context.secrets.store(keySecret, key);
      writeShared({ apiUrl, apiKey: key, username: me.username, email: me.email });
      await this.refreshStatus();
      const next = await vscode.window.showInformationMessage(
        `Signed in to Stint as ${me.username}. Want to track your AI agents too?`,
        "Track agents",
        "Open dashboard",
      );
      if (next === "Track agents") this.connectAgents();
      if (next === "Open dashboard") await vscode.env.openExternal(vscode.Uri.parse(`${apiUrl}/dashboard`));
    } catch (error) {
      vscode.window.showErrorMessage(`Stint sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.signingIn = false;
    }
  }

  private async poll(apiUrl: string, device: DeviceCode, cancel: vscode.CancellationToken): Promise<string | null> {
    let interval = Math.max(device.interval, 2) * 1000;
    const deadline = Date.now() + device.expires_in * 1000;
    while (Date.now() < deadline && !cancel.isCancellationRequested) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      try {
        const { access_token } = await request<{ access_token: string }>(apiUrl, "/api/auth/device/token", {
          body: {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: device.device_code,
            client_id: clientId,
          },
          userAgent: this.agent,
        });
        return access_token;
      } catch (error) {
        if (!(error instanceof StintError)) throw error;
        if (error.code === "authorization_pending" || error.status === 0) continue;
        if (error.code === "slow_down") {
          interval += 5000;
          continue;
        }
        if (error.code === "access_denied") throw new Error("the sign-in was denied in the browser.");
        throw error;
      }
    }
    if (!cancel.isCancellationRequested) throw new Error("the code expired. Run “Stint: Sign in” again.");
    return null;
  }

  private async signOut() {
    this.key = undefined;
    await this.context.secrets.delete(keySecret);
    const shared = readShared();
    if (shared.apiKey) {
      const choice = await vscode.window.showWarningMessage(
        "The Stint CLI on this machine uses the same key. Sign it out too?",
        "Sign out everywhere",
        "Only this editor",
      );
      if (choice === "Sign out everywhere") writeShared({ apiKey: undefined, username: undefined, email: undefined });
    }
    await this.refreshStatus();
  }

  private connectAgents() {
    const terminal = vscode.window.createTerminal({ name: "Stint" });
    terminal.show();
    terminal.sendText("npx --yes getstint@latest install");
  }

  private async showStatus() {
    const shared = readShared();
    const lines = [
      `Server: ${this.apiUrl}`,
      `Signed in: ${this.key ? (shared.username ?? "yes") : "no"}`,
      `Editor: ${this.editor}`,
      `Waiting to send: ${this.pending.length}`,
    ];
    const choice = await vscode.window.showInformationMessage(
      lines.join(" · "),
      this.key ? "Open dashboard" : "Sign in",
      "Show log",
    );
    if (choice === "Open dashboard") await vscode.commands.executeCommand("stint.openDashboard");
    if (choice === "Sign in") await this.signIn();
    if (choice === "Show log") this.output.show();
  }

  dispose() {
    enqueue(this.pending.splice(0));
    this.disposables.forEach((disposable) => disposable.dispose());
    this.status.dispose();
    this.output.dispose();
  }
}

let instance: Stint | undefined;

export async function activate(context: vscode.ExtensionContext) {
  instance = new Stint(context);
  context.subscriptions.push(instance);
  await instance.start();
}

export async function deactivate() {
  await instance?.flush();
}
