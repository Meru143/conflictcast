// Renders the opened-flow demo by staging assets locally and running VHS inside a container.
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { captureOpenedFlow } from "./captureOpenedFlow";
import { formatOpenedFlowTranscript } from "./formatOpenedFlowTranscript";

const VhsImage = "ghcr.io/charmbracelet/vhs";
const ContainerWorkdir = "/demo";
const TapeFileName = "conflictcast-opened-flow.tape";
const TranscriptFileName = "pull-request-opened.txt";
const ReplayScriptFileName = "replay-opened-flow.sh";
const Mp4FileName = "conflictcast-opened-flow.mp4";
const PngFileName = "conflictcast-opened-flow.png";
const GifFileName = "conflictcast-opened-flow.gif";

type CommandResult = {
  stdout: string;
  stderr: string;
};

type RunCommandOptions = {
  captureOutput?: boolean;
  optional?: boolean;
};

function getDemoPaths() {
  const demoRoot = path.join(process.cwd(), "docs", "demo");
  const assetRoot = path.join(demoRoot, "assets");
  const captureRoot = path.join(demoRoot, "captures");
  const stagingRoot = path.join(demoRoot, "staging", "opened-flow");

  return {
    demoRoot,
    assetRoot,
    captureRoot,
    stagingRoot,
    tapeSourcePath: path.join(demoRoot, TapeFileName),
    transcriptPath: path.join(captureRoot, TranscriptFileName),
    stageTranscriptPath: path.join(stagingRoot, TranscriptFileName),
    stageReplayScriptPath: path.join(stagingRoot, ReplayScriptFileName),
    stageTapePath: path.join(stagingRoot, TapeFileName),
    renderedMp4Path: path.join(assetRoot, Mp4FileName),
    renderedPngPath: path.join(assetRoot, PngFileName),
    renderedGifPath: path.join(assetRoot, GifFileName),
    palettePath: path.join(stagingRoot, "palette.png"),
  };
}

function buildReplayScript(transcriptFileName: string): string {
  return [
    "#!/bin/sh",
    'printf "captured from: npm run demo:capture\\n\\n"',
    `while IFS= read -r line || [ -n "$line" ]; do`,
    '  printf "%s\\n" "$line"',
    "  sleep 0.18",
    `done < "${transcriptFileName}"`,
    "sleep 1",
    "",
  ].join("\n");
}

async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
      stdio: options.captureOutput ? "pipe" : "inherit",
    });
    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => {
      if (options.optional) {
        resolve({ stdout, stderr: `${stderr}${String(error)}` });
        return;
      }

      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0 || options.optional) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code}${stderr ? `\n${stderr}` : ""}`,
        ),
      );
    });
  });
}

async function ensureDockerAvailable(): Promise<void> {
  await runCommand("docker", ["version"], { captureOutput: true });
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await runCommand("ffmpeg", ["-version"], { captureOutput: true });
    return true;
  } catch {
    return false;
  }
}

async function stageDemoFiles(): Promise<ReturnType<typeof getDemoPaths>> {
  const paths = getDemoPaths();
  const capture = await captureOpenedFlow();
  const transcript = formatOpenedFlowTranscript(capture);

  await mkdir(paths.assetRoot, { recursive: true });
  await mkdir(paths.captureRoot, { recursive: true });
  await rm(paths.stagingRoot, { recursive: true, force: true });
  await mkdir(paths.stagingRoot, { recursive: true });
  await writeFile(paths.transcriptPath, transcript, "utf-8");
  await copyFile(paths.transcriptPath, paths.stageTranscriptPath);
  await copyFile(paths.tapeSourcePath, paths.stageTapePath);
  await writeFile(paths.stageReplayScriptPath, buildReplayScript(TranscriptFileName), "utf-8");

  return paths;
}

async function renderInsideContainer(paths: ReturnType<typeof getDemoPaths>): Promise<void> {
  const containerName = `conflictcast-vhs-${randomUUID()}`;
  const { stdout } = await runCommand(
    "docker",
    ["create", "--entrypoint", "sh", "--name", containerName, VhsImage, "-lc", "sleep infinity"],
    { captureOutput: true },
  );
  const containerId = stdout.trim();

  try {
    await runCommand("docker", ["start", containerId]);
    await runCommand("docker", ["exec", containerId, "sh", "-lc", `mkdir -p ${ContainerWorkdir}`]);
    await runCommand("docker", ["cp", `${paths.stagingRoot}${path.sep}.`, `${containerId}:${ContainerWorkdir}`]);
    await runCommand(
      "docker",
      ["exec", containerId, "sh", "-lc", `cd ${ContainerWorkdir} && vhs ${TapeFileName}`],
    );
    await runCommand(
      "docker",
      ["cp", `${containerId}:${ContainerWorkdir}/${Mp4FileName}`, paths.renderedMp4Path],
    );
    await runCommand(
      "docker",
      ["cp", `${containerId}:${ContainerWorkdir}/${PngFileName}`, paths.renderedPngPath],
    );
  } finally {
    await runCommand("docker", ["rm", "-f", containerId], { optional: true });
  }
}

async function renderGif(paths: ReturnType<typeof getDemoPaths>): Promise<boolean> {
  if (!(await hasFfmpeg())) {
    return false;
  }

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    paths.renderedMp4Path,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    "fps=12,scale=1100:-1:flags=lanczos,palettegen",
    paths.palettePath,
  ]);
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    paths.renderedMp4Path,
    "-i",
    paths.palettePath,
    "-lavfi",
    "fps=12,scale=1100:-1:flags=lanczos[x];[x][1:v]paletteuse",
    paths.renderedGifPath,
  ]);

  return true;
}

async function main(): Promise<void> {
  await ensureDockerAvailable();
  const paths = await stageDemoFiles();

  process.stdout.write(`staged demo capture at ${paths.transcriptPath}\n`);
  process.stdout.write(`rendering VHS inside ${VhsImage}\n`);

  await renderInsideContainer(paths);

  const renderedGif = await renderGif(paths);

  process.stdout.write(`wrote ${paths.renderedMp4Path}\n`);
  process.stdout.write(`wrote ${paths.renderedPngPath}\n`);

  if (renderedGif) {
    process.stdout.write(`wrote ${paths.renderedGifPath}\n`);
  } else {
    process.stdout.write("ffmpeg not found; skipped GIF conversion\n");
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
