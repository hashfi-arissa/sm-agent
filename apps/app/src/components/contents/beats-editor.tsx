"use client";

import type { Beat } from "@repo/types";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

const EMPTY_BEAT: Beat = { voiceover: "", onScreenText: "", seconds: 5 };

export function BeatsEditor({
  beats,
  onChange,
}: {
  beats: Beat[];
  onChange: (beats: Beat[]) => void;
}) {
  function update(index: number, patch: Partial<Beat>) {
    onChange(beats.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= beats.length) return;
    const next = [...beats];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function remove(index: number) {
    onChange(beats.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {beats.length === 0 && (
        <p className="text-muted-foreground text-sm">No beats yet.</p>
      )}
      {beats.map((beat, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Beat {i + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Move beat up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Move beat down"
                disabled={i === beats.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove beat"
                onClick={() => remove(i)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`beat-${i}-voiceover`} className="text-xs">
                Voiceover
              </Label>
              <Textarea
                id={`beat-${i}-voiceover`}
                value={beat.voiceover}
                onChange={(e) => update(i, { voiceover: e.target.value })}
                className="min-h-14 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`beat-${i}-text`} className="text-xs">
                On-screen text
              </Label>
              <Textarea
                id={`beat-${i}-text`}
                value={beat.onScreenText}
                onChange={(e) => update(i, { onScreenText: e.target.value })}
                className="min-h-14 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`beat-${i}-seconds`} className="text-xs">
                Seconds
              </Label>
              <Input
                id={`beat-${i}-seconds`}
                type="number"
                min={0}
                max={180}
                value={beat.seconds}
                onChange={(e) =>
                  update(i, {
                    seconds: Math.max(
                      0,
                      Math.min(180, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...beats, { ...EMPTY_BEAT }])}
      >
        <Plus data-icon="inline-start" />
        Add beat
      </Button>
    </div>
  );
}
