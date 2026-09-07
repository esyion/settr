"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchBackendBaseUrl,
  updateBackendBaseUrl,
} from "@/features/settings/api";

/**
 * 后端连接设置卡片:展示并保存后端 API 地址。
 * <p>
 * 校验最终约束在 Rust 端(格式 + HTTPS-only);保存成功回填归一化地址。
 */
export function ConnectionSettings() {
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBackendBaseUrl()
      .then((url) => {
        if (!cancelled) setBaseUrl(url);
      })
      .catch(() => {
        // 加载失败保留空值,用户保存时会得到具体校验错误。
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 保存后端地址:成功/失败均给出 toast 反馈,失败不改动本地输入值。
   */
  async function handleSave() {
    setSaving(true);
    try {
      const normalized = await updateBackendBaseUrl(baseUrl);
      setBaseUrl(normalized);
      toast.success("后端地址已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存后端地址失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>后端连接</CardTitle>
        <CardDescription>
          生产环境必须使用 HTTPS;HTTP 仅允许 localhost 调试。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder={loading ? "加载中…" : "https://api.example.com"}
          disabled={loading || saving}
          maxLength={500}
          aria-label="后端地址"
        />
        <Button
          onClick={() => void handleSave()}
          disabled={loading || saving || baseUrl.trim() === ""}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Globe />}
          保存后端地址
        </Button>
      </CardContent>
    </Card>
  );
}
