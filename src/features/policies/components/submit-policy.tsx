"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 政策草稿提交表单。
 */
export function SubmitPolicyCard({ data }: { data: PoliciesDataApi }) {
  const [policyType, setPolicyType] = useState<"AGENT" | "CLAUDE">("AGENT");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>提交政策变更</CardTitle>
        <CardDescription>填写新版本内容与变更说明</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            // 仅在提交成功后清空输入,失败保留内容供用户重试。
            void (async () => {
              const ok = await data.submitPolicyChange({
                policyType,
                content,
                message,
              });
              if (ok) {
                setContent("");
                setMessage("");
              }
            })();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label>政策类型</Label>
            <Select
              value={policyType}
              onValueChange={(v) => setPolicyType(v as "AGENT" | "CLAUDE")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AGENT">AGENT</SelectItem>
                <SelectItem value="CLAUDE">CLAUDE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="policy-content">内容</Label>
            <Textarea
              id="policy-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="新版本政策内容"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="policy-message">变更说明</Label>
            <Input
              id="policy-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="简述本次变更原因"
            />
          </div>
          <Button
            type="submit"
            disabled={data.busy !== null || !content.trim()}
          >
            <Send />
            提交草稿
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
