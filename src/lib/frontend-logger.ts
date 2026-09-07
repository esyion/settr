import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

/**
 * 受支持的 console 方法名集合。
 */
type ConsoleMethodName = "log" | "debug" | "info" | "warn" | "error";

/**
 * plugin-log 前端写入函数签名（message 入，异步落盘）。
 */
type LogForwarder = (message: string) => Promise<void>;

/**
 * 全局安装标记，防止 React 严格模式或热更新导致 console 被重复包装。
 */
const INSTALL_FLAG = "__agentsPlusFrontendLoggingInstalled";

/**
 * 将 console 调用的任意参数合并为单行日志文本。
 * <p>
 * 对象与数组走 JSON 序列化；序列化失败时退回 String()，保证日志函数永不抛错。
 */
function formatLogArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

/**
 * 将指定 console 方法包装为"保留原行为 + 转发到日志文件"的实现。
 * <p>
 * 转发失败时静默吞错：日志系统自身的异常不允许再进入控制台或触发未处理 rejection。
 */
function forwardConsoleMethod(methodName: ConsoleMethodName, forwarder: LogForwarder): void {
  const original = console[methodName].bind(console);
  console[methodName] = (...args: unknown[]) => {
    original(...args);
    forwarder(formatLogArgs(args)).catch(() => {
      // 静默：日志转发失败不应影响主流程，也不应产生未处理 rejection。
    });
  };
}

/**
 * 安装全局未捕获异常监听（unhandledrejection 与 window error）。
 * <p>
 * 两类事件统一以 error 级别写入日志文件，供用户反馈问题时追溯前端崩溃。
 */
function attachGlobalErrorHandlers(): void {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.stack ?? event.reason.message : event.reason;
    error(formatLogArgs(["Unhandled rejection:", reason])).catch(() => {
      // 静默：见 forwardConsoleMethod。
    });
  });
  window.addEventListener("error", (event) => {
    error(formatLogArgs(["Uncaught error:", event.message, `(${event.filename}:${event.lineno}:${event.colno})`])).catch(() => {
      // 静默：见 forwardConsoleMethod。
    });
  });
}

/**
 * 初始化前端日志转发：劫持 console 五个级别方法并注册全局错误监听。
 * <p>
 * 幂等（以 window 标记防重复安装）；仅在浏览器环境生效，SSR/构建期直接跳过。
 * 调用后前端所有 console 输出与未捕获异常都会经 IPC 写入 Rust 侧日志文件。
 */
export function setupFrontendLogging(): void {
  if (typeof window === "undefined") return;
  const holder = window as typeof window & { [INSTALL_FLAG]?: boolean };
  if (holder[INSTALL_FLAG]) return;
  holder[INSTALL_FLAG] = true;

  forwardConsoleMethod("log", trace);
  forwardConsoleMethod("debug", debug);
  forwardConsoleMethod("info", info);
  forwardConsoleMethod("warn", warn);
  forwardConsoleMethod("error", error);
  attachGlobalErrorHandlers();
}
