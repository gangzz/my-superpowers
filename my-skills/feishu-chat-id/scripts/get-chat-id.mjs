#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

export const DEFAULT_ENV_NAME = "FEISHU_WORK_REPORT_CHAT_ID";
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const SDK_VERSION = "1.73.0";

const SDK_PACKAGE = "@larksuiteoapi/node-sdk";
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const APP_ID_PATTERN = /^cli_[0-9a-fA-F]{16}$/;
const activeTemporaryDirectories = new Set();

function usage() {
  return [
    "用法：node scripts/get-chat-id.mjs [--env-name NAME] [--timeout SECONDS]",
    "",
    `默认变量名：${DEFAULT_ENV_NAME}`,
    `默认等待时间：${DEFAULT_TIMEOUT_SECONDS} 秒`,
    "凭证会在交互式终端中询问；不接受命令行或环境变量传入。",
  ].join("\n");
}

function readOption(argv, name) {
  const index = argv.findIndex((item) => item === name || item.startsWith(`${name}=`));
  if (index === -1) return undefined;
  const item = argv[index];
  const value = item.includes("=") ? item.slice(item.indexOf("=") + 1) : argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`);
  return value;
}

export function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };

  const known = new Set(["--env-name", "--timeout"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const option = item.split("=", 1)[0];
    if (!known.has(option)) {
      if (index > 0 && known.has(argv[index - 1]) && !argv[index - 1].includes("=")) continue;
      throw new Error(`未知参数：${item}`);
    }
    if (!item.includes("=")) index += 1;
  }

  const envName = readOption(argv, "--env-name") ?? DEFAULT_ENV_NAME;
  if (!ENV_NAME_PATTERN.test(envName)) {
    throw new Error("环境变量名不合法；请使用字母或下划线开头，只包含字母、数字和下划线的名称。");
  }

  const timeoutText = readOption(argv, "--timeout") ?? String(DEFAULT_TIMEOUT_SECONDS);
  if (!/^\d+$/.test(timeoutText)) throw new Error("等待时间必须是 1–3600 的整数秒。");
  const timeoutSeconds = Number(timeoutText);
  if (timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new Error("等待时间必须是 1–3600 的整数秒。");
  }

  return { help: false, envName, timeoutSeconds };
}

export function createConfirmationCode() {
  return `FSC-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function readText(message) {
  if (message?.message_type !== "text") return "";
  try {
    const content = JSON.parse(message.content ?? "{}");
    return typeof content.text === "string" ? content.text : "";
  } catch {
    return "";
  }
}

export function extractMatchingChatId(event, confirmationCode) {
  const message = event?.message;
  if (message?.chat_type !== "group") return null;
  if (typeof message.chat_id !== "string" || !message.chat_id.trim()) return null;
  if (!Array.isArray(message.mentions) || message.mentions.length === 0) return null;
  if (!readText(message).includes(confirmationCode)) return null;
  return message.chat_id;
}

class MutedTerminalOutput extends Writable {
  constructor(destination) {
    super();
    this.destination = destination;
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) this.destination.write(chunk, encoding);
    callback();
  }
}

export async function readCredentials({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("需要交互式终端输入飞书凭证；请不要通过聊天、参数、环境变量或文件传递 Secret。");
  }

  const terminalOutput = new MutedTerminalOutput(output);
  const prompt = createInterface({ input, output: terminalOutput, terminal: true });
  let appId = "";
  let appSecret = "";
  try {
    appId = (await prompt.question("FEISHU_APP_ID（App ID / app_key）: ")).trim();
    if (!APP_ID_PATTERN.test(appId)) {
      throw new Error("FEISHU_APP_ID 格式不正确；请从飞书开发者后台复制 App ID（形如 cli_ 后接 16 位十六进制字符）。");
    }
    output.write("FEISHU_APP_SECRET（输入不可见）: ");
    terminalOutput.muted = true;
    appSecret = (await prompt.question("")).trim();
    terminalOutput.muted = false;
    output.write("\n");
  } finally {
    terminalOutput.muted = false;
    prompt.close();
  }

  if (!appSecret) throw new Error("FEISHU_APP_SECRET 不能为空。");
  return { appId, appSecret };
}

function scrubCredentialEnvironment(environment) {
  const clean = { ...environment };
  for (const key of [
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "TENANT_ACCESS_TOKEN",
    "FEISHU_TENANT_ACCESS_TOKEN",
  ]) {
    delete clean[key];
  }
  return clean;
}

async function packageVersion(packageJsonPath) {
  const content = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return content.version;
}

async function findExactLocalSdk() {
  const localRequire = createRequire(import.meta.url);
  try {
    const packageJsonPath = localRequire.resolve(`${SDK_PACKAGE}/package.json`);
    if (await packageVersion(packageJsonPath) !== SDK_VERSION) return null;
    return localRequire(SDK_PACKAGE);
  } catch (error) {
    if (["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"].includes(error?.code)) return null;
    throw error;
  }
}

function runNpmInstall(directory) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const installEnvironment = scrubCredentialEnvironment(process.env);
  installEnvironment.npm_config_cache = path.join(directory, ".npm-cache");
  installEnvironment.npm_config_audit = "false";
  installEnvironment.npm_config_fund = "false";
  installEnvironment.npm_config_ignore_scripts = "true";
  installEnvironment.npm_config_update_notifier = "false";

  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, [
      "install",
      "--prefix",
      directory,
      "--no-save",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      `${SDK_PACKAGE}@${SDK_VERSION}`,
    ], {
      env: installEnvironment,
      stdio: "ignore",
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(signal ? `npm 安装被 ${signal} 中止。` : `npm 安装失败（退出码 ${code}）。`));
    });
  });
}

async function removeTemporaryDirectory(directory) {
  if (!directory) return;
  await rm(directory, { recursive: true, force: true });
  activeTemporaryDirectories.delete(directory);
}

export async function prepareSdk({ forceTemporary = false, output = process.stdout } = {}) {
  if (!forceTemporary) {
    const localSdk = await findExactLocalSdk();
    if (localSdk) return { sdk: localSdk, temporary: false, cleanup: async () => {} };
  }

  output.write(`正在临时准备官方 ${SDK_PACKAGE}@${SDK_VERSION}；退出时会删除。\n`);
  const directory = await mkdtemp(path.join(tmpdir(), "feishu-chat-id-"));
  activeTemporaryDirectories.add(directory);
  try {
    await runNpmInstall(directory);
    const temporaryRequire = createRequire(path.join(directory, "package.json"));
    const sdk = temporaryRequire(SDK_PACKAGE);
    const installedPackageJson = temporaryRequire.resolve(`${SDK_PACKAGE}/package.json`);
    assert.equal(await packageVersion(installedPackageJson), SDK_VERSION);
    return {
      sdk,
      temporary: true,
      cleanup: () => removeTemporaryDirectory(directory),
    };
  } catch (error) {
    await removeTemporaryDirectory(directory);
    throw error;
  }
}

const silentLogger = Object.freeze({
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
});

export function captureChatId({
  sdk,
  appId,
  appSecret,
  confirmationCode = createConfirmationCode(),
  timeoutMs = DEFAULT_TIMEOUT_SECONDS * 1000,
  connectTimeoutMs = 30_000,
  output = process.stdout,
} = {}) {
  if (!sdk?.WSClient || !sdk?.EventDispatcher) throw new Error("飞书 SDK 不完整。");

  return new Promise((resolve) => {
    let accepting = false;
    let settled = false;
    let connectTimer = null;
    let waitTimer = null;
    let wsClient = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      accepting = false;
      if (connectTimer) clearTimeout(connectTimer);
      if (waitTimer) clearTimeout(waitTimer);
      try {
        wsClient?.close?.({ force: true });
      } catch {
        // 关闭失败不应覆盖原始结果；CLI 进程随后会退出并释放剩余句柄。
      }
      resolve(result);
    };

    const dispatcher = new sdk.EventDispatcher({ logger: silentLogger }).register({
      "im.message.receive_v1": async (event) => {
        if (!accepting) return;
        const chatId = extractMatchingChatId(event, confirmationCode);
        if (chatId) finish({ status: "success", chatId });
      },
    });

    wsClient = new sdk.WSClient({
      appId,
      appSecret,
      logger: silentLogger,
      loggerLevel: sdk.LoggerLevel?.error,
      autoReconnect: false,
      handshakeTimeoutMs: Math.min(connectTimeoutMs, 15_000),
      onReady: () => {
        if (settled || accepting) return;
        if (connectTimer) clearTimeout(connectTimer);
        accepting = true;
        const seconds = Math.ceil(timeoutMs / 1000);
        output.write(`长连接已就绪。请在 ${seconds} 秒内到目标群发送以下消息（必须先真正 @机器人）：\n@机器人 获取群ID ${confirmationCode}\n`);
        waitTimer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
      },
      onError: () => finish({ status: "connection_error" }),
    });

    connectTimer = setTimeout(() => finish({ status: "connection_timeout" }), connectTimeoutMs);
    Promise.resolve(wsClient.start({ eventDispatcher: dispatcher }))
      .catch(() => finish({ status: "connection_error" }));
  });
}

function removeAllTemporaryDirectoriesSync() {
  for (const directory of activeTemporaryDirectories) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // 进程退出阶段只能尽力清理精确记录的临时目录。
    }
  }
  activeTemporaryDirectories.clear();
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n\n${usage()}\n`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("错误：需要交互式终端输入飞书凭证；请不要通过聊天、参数、环境变量或文件传递 Secret。\n");
    return 1;
  }

  let prepared = null;
  let credentials = null;
  try {
    prepared = await prepareSdk();
    credentials = await readCredentials();
    const result = await captureChatId({
      sdk: prepared.sdk,
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      timeoutMs: options.timeoutSeconds * 1000,
    });

    if (result.status === "success") {
      process.stdout.write(`\n${options.envName}=${result.chatId}\n`);
      return 0;
    }
    if (result.status === "timeout") {
      process.stderr.write("已超时，未取得 chat_id；长连接已关闭，未保存任何配置。\n");
      return 3;
    }
    if (result.status === "connection_timeout") {
      process.stderr.write("飞书长连接建立超时；请检查网络、应用凭证和长连接订阅配置。\n");
      return 4;
    }
    process.stderr.write("无法建立飞书长连接；请检查 App ID/Secret、机器人能力、事件订阅和已发布权限。\n");
    return 4;
  } catch (error) {
    const safePrefixes = ["npm ", "FEISHU_APP_ID", "FEISHU_APP_SECRET", "需要交互式终端"];
    const message = safePrefixes.some((prefix) => error?.message?.startsWith(prefix))
      ? error.message
      : "执行失败；未输出或保存任何凭证。请检查交互式终端、Node.js、npm 和网络。";
    process.stderr.write(`错误：${message}\n`);
    return 1;
  } finally {
    if (credentials) {
      credentials.appId = "";
      credentials.appSecret = "";
    }
    try {
      await prepared?.cleanup?.();
    } catch {
      process.stderr.write("警告：临时 SDK 目录未能正常删除；进程退出时将再次清理。\n");
    }
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.once("exit", removeAllTemporaryDirectoriesSync);
  const exitCode = await main();
  process.exit(exitCode);
}
