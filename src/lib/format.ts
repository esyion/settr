/**
 * 时间格式化辅助：把 ISO 时间或 epoch 毫秒转成 zh-CN 本地化字符串。
 * 非法或缺失值统一显示为 "—"，避免空指针。
 */
export function formatTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * 字节数人类可读化：B / KB / MB 三档，单位精度随量级调整。
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * 把内容哈希裁短为 12 位十六进制字符串，便于在 UI 中展示。
 * "sha256:" 前缀会先剥离；空值返回 "—" 以保持表格对齐。
 */
export function shortHash(value: string | null | undefined): string {
  return value ? value.replace(/^sha256:/i, "").slice(0, 12) : "—";
}
