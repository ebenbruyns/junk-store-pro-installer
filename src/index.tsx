import {
  ButtonItem,
  definePlugin,
  Navigation,
  PanelSection,
  PanelSectionRow,
  Spinner,
  staticClasses,
} from "@decky/ui";
import { FC, useState } from "react";
import { FaBoxOpen } from "react-icons/fa";

declare global {
  const appStore: {
    allApps: { appid: number }[];
    GetAppOverviewByAppID: (id: number) => { m_gameid?: string } | null;
  };
  const appDetailsStore: {
    RequestAppDetails: (id: number) => Promise<void>;
    GetAppDetails: (id: number) => unknown;
  };
  const appDetailsCache: {
    FetchDataForApp: (id: number) => Promise<void>;
  };
}

const APP_NAME = "Junk Store Pro Installer";
const BOOTSTRAP = "https://i.junkstore.xyz/i/bootstrap.sh";
const LAUNCH_OPTIONS = `-c "curl -fsSL ${BOOTSTRAP} | bash"`;

enum AppRunStateChange {
  START,
  END,
}

function gameIDFromAppID(appid: number): string | number {
  const game = appStore.GetAppOverviewByAppID(appid);
  return game ? game.m_gameid ?? -1 : -1;
}

function configureShortcut(
  id: number,
  lo: { Exe: string; WorkingDir: string; Options: string; Compatibility?: boolean; CompatToolName?: string },
) {
  SteamClient.Apps.SetAppLaunchOptions(id, lo.Options);
  SteamClient.Apps.SetShortcutExe(id, lo.Exe);
  SteamClient.Apps.SetShortcutStartDir(id, lo.WorkingDir);
  if (lo.Compatibility) SteamClient.Apps.SpecifyCompatTool(id, lo.CompatToolName ?? "");
}

function registerForAppRunStateChange(
  appId: number,
  callback: () => void,
  stateChange: AppRunStateChange,
): { unregister: () => void } {
  return SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
    (data: { unAppID: number; bRunning: boolean }) => {
      if (data.unAppID !== appId) return;
      if (stateChange === AppRunStateChange.START && data.bRunning) callback();
      if (stateChange === AppRunStateChange.END && !data.bRunning) callback();
    },
  );
}

async function runApp(appId: number, onAppClose?: () => void, onAppLaunch?: () => void) {
  if (onAppLaunch) {
    const { unregister } = registerForAppRunStateChange(
      appId,
      () => {
        onAppLaunch();
        unregister();
      },
      AppRunStateChange.START,
    );
  }
  if (onAppClose) {
    const { unregister } = registerForAppRunStateChange(
      appId,
      () => {
        setTimeout(() => onAppClose(), 1000);
        unregister();
      },
      AppRunStateChange.END,
    );
  }
  const gid = gameIDFromAppID(appId);
  if (gid && gid !== -1) SteamClient.Apps.RunGame(gid as string, "", -1, 100);
}

type Phase = "idle" | "starting" | "running" | "error";

const Content: FC = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setErr(null);
    setPhase("starting");
    try {
      const id = await SteamClient.Apps.AddShortcut(APP_NAME, "/usr/bin/bash", "", "");
      await appDetailsCache.FetchDataForApp(id);
      await appDetailsStore.RequestAppDetails(id);
      SteamClient.Apps.SetShortcutName(id, APP_NAME);
      configureShortcut(id, {
        Exe: "/usr/bin/bash",
        WorkingDir: "/usr/bin",
        Options: LAUNCH_OPTIONS,
        Compatibility: false,
      });
      runApp(
        id,
        () => {
          setPhase("idle");
          Navigation.CloseSideMenus();
          Navigation.NavigateBack()
          setTimeout(() => SteamClient.Apps.RemoveShortcut(id), 1000);
        },
        () => setPhase("running"),
      );
    } catch (e) {
      setErr(`${e}`);
      setPhase("error");
    }
  };

  const busy = phase === "starting" || phase === "running";

  return (
    <PanelSection title="Junk Store Pro">
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={onClick}>
          {busy ? "Installing…" : "Install Junk Store Pro"}
        </ButtonItem>
      </PanelSectionRow>
      {busy && (
        <PanelSectionRow>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Spinner style={{ width: "20px", height: "20px" }} />
            <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>
              {phase === "starting"
                ? "Starting the installer…"
                : "Installing — follow the window…"}
            </span>
          </div>
        </PanelSectionRow>
      )}
      {phase === "error" && err && (
        <PanelSectionRow>
          <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
            Could not start the installer: {err}
          </div>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};

export default definePlugin(() => ({
  name: APP_NAME,
  title: <div className={staticClasses.Title}>{APP_NAME}</div>,
  content: <Content />,
  icon: <FaBoxOpen />,
}));
