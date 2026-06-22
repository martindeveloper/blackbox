import { spawn } from "node:child_process";

const DEPENDENCIES = new Set(["ffmpeg", "cwebp"]);

function commandExists(command) {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  return new Promise((resolve) => {
    const child = spawn(checker, [command], {
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function displayCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[a-zA-Z0-9_./:=+-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

async function linuxInstallSpec(dependency) {
  const candidates = [
    {
      manager: "apt",
      executable: "apt-get",
      args: ["install", "-y", dependency === "ffmpeg" ? "ffmpeg" : "webp"],
    },
    {
      manager: "dnf",
      executable: "dnf",
      args: ["install", "-y", dependency === "ffmpeg" ? "ffmpeg" : "libwebp-tools"],
    },
    {
      manager: "pacman",
      executable: "pacman",
      args: ["-S", "--needed", "--noconfirm", dependency === "ffmpeg" ? "ffmpeg" : "libwebp-utils"],
    },
    {
      manager: "zypper",
      executable: "zypper",
      args: ["--non-interactive", "install", dependency === "ffmpeg" ? "ffmpeg" : "libwebp-tools"],
    },
  ];

  const candidate = (
    await Promise.all(
      candidates.map(async (entry) => ((await commandExists(entry.executable)) ? entry : null)),
    )
  ).find(Boolean);

  if (!candidate) {
    return {
      platform: "linux",
      platformLabel: "Linux",
      packageManager: null,
      command: dependency === "ffmpeg" ? "Install the ffmpeg package" : "Install WebP tools",
      canInstall: false,
      unavailableReason: "No supported package manager was detected.",
      run: null,
    };
  }

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const hasPkexec = isRoot || (await commandExists("pkexec"));
  const executable = isRoot ? candidate.executable : "pkexec";
  const args = isRoot ? candidate.args : [candidate.executable, ...candidate.args];

  return {
    platform: "linux",
    platformLabel: "Linux",
    packageManager: candidate.manager,
    command: displayCommand(executable, args),
    canInstall: hasPkexec,
    unavailableReason: hasPkexec
      ? null
      : "Automatic installation needs pkexec. Run the command as an administrator instead.",
    run: hasPkexec ? { executable, args } : null,
  };
}

export async function dependencyInstallInfo(dependency) {
  if (!DEPENDENCIES.has(dependency)) {
    throw new TypeError("Unsupported dependency");
  }

  if (process.platform === "darwin") {
    const args = ["install", dependency === "ffmpeg" ? "ffmpeg" : "webp"];
    const available = await commandExists("brew");
    return {
      dependency,
      platform: "macos",
      platformLabel: "macOS",
      packageManager: "Homebrew",
      command: displayCommand("brew", args),
      canInstall: available,
      unavailableReason: available
        ? null
        : "Homebrew was not found. Install Homebrew first, then run this command.",
      run: available ? { executable: "brew", args } : null,
    };
  }

  if (process.platform === "win32") {
    const packageId = dependency === "ffmpeg" ? "Gyan.FFmpeg" : "Google.Libwebp";
    const args = [
      "install",
      "--exact",
      "--id",
      packageId,
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity",
    ];
    const available = await commandExists("winget");
    return {
      dependency,
      platform: "windows",
      platformLabel: "Windows",
      packageManager: "winget",
      command: displayCommand("winget", args),
      canInstall: available,
      unavailableReason: available
        ? null
        : "winget was not found. Install App Installer from Microsoft, then run this command.",
      run: available ? { executable: "winget", args } : null,
    };
  }

  const info = await linuxInstallSpec(dependency);
  return { dependency, ...info };
}

function runInstaller(executable, args) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let output = "";
    const append = (chunk) => {
      output = `${output}${chunk}`.slice(-12_000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) =>
      resolve({
        ok: code === 0,
        output:
          output.trim() || (code === 0 ? "Installation completed." : `Installer exited ${code}.`),
      }),
    );
  });
}

export async function installDependency(dependency) {
  const info = await dependencyInstallInfo(dependency);
  if (!info.run) {
    return {
      ok: false,
      output: info.unavailableReason ?? "Automatic installation is unavailable.",
      restartRequired: false,
    };
  }
  const result = await runInstaller(info.run.executable, info.run.args);
  return {
    ...result,
    restartRequired: result.ok && process.platform === "win32",
  };
}
