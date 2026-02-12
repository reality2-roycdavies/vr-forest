#!/usr/bin/env python3
"""
Convert Claude Code JSONL conversation transcripts to readable Markdown.

Usage:
    python convert.py <input.jsonl> [output.md]
    python convert.py --all          # Convert all .jsonl files in this directory

JSONL format (Claude Code):
  Each line is a JSON object with a "type" field:
    - "user" with message.content as string -> human message
    - "user" with message.content as list containing tool_result -> tool output
    - "assistant" with message.content list containing "text" -> Claude text
    - "assistant" with message.content list containing "tool_use" -> Claude tool call
    - "assistant" with message.content list containing "thinking" -> skipped
    - "progress", "file-history-snapshot" -> metadata (skipped)
"""

import json
import sys
from datetime import datetime
from pathlib import Path


# --- Configuration ---
MAX_CODE_BLOCK_LINES = 50
MAX_TOOL_OUTPUT_LINES = 30

SESSION_TITLES = {
    "day1-01-initial-appraisal": ("February 10, 2026", "Day 1, Session 1 \u2014 Initial Appraisal"),
    "day1-02-footsteps-crickets-spatial-audio": ("February 10, 2026", "Day 1, Session 2 \u2014 Footsteps, Crickets & Spatial Audio"),
    "day1-03-water-ponds-shores": ("February 10, 2026", "Day 1, Session 3 \u2014 Water, Ponds & Shores"),
    "day2-01-shadows-creatures-morepork": ("February 11, 2026", "Day 2, Session 1 \u2014 Shadows, Creatures & Morepork"),
    "day2-02-shadows-creatures-continued": ("February 11, 2026", "Day 2, Session 2 \u2014 Shadows & Creatures Continued"),
    "day2-03-moon-shadows-water-ambience": ("February 11, 2026", "Day 2, Session 3 \u2014 Moon Shadows & Water Ambience"),
    "day3-01-collectibles-minimap-terrain": ("February 12, 2026", "Day 3, Session 1 \u2014 Collectibles, Minimap & Terrain"),
    "day3-02-water-edge-effects": ("February 12, 2026", "Day 3, Session 2 \u2014 Water Edge Effects"),
    "day4-01-cloud-diversity": ("February 13, 2026", "Day 4, Session 1 \u2014 Cloud Diversity"),
    "day4-02-weather-system": ("February 13, 2026", "Day 4, Session 2 \u2014 Weather System"),
    "day4-03-weather-polish-stormy-water": ("February 13, 2026", "Day 4, Session 3 \u2014 Weather Polish & Stormy Water"),
}


def format_timestamp(ts_str):
    """Convert ISO timestamp to HH:MM format."""
    if not ts_str:
        return ""
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except (ValueError, AttributeError):
        return ""


def truncate_code_blocks(text, max_lines=MAX_CODE_BLOCK_LINES):
    """Truncate long code blocks in markdown text, preserving structure."""
    result = []
    in_code_block = False
    code_line_count = 0
    truncated = False
    fence_marker = ""

    for line in text.split("\n"):
        stripped = line.strip()

        if not in_code_block and (stripped.startswith("```") or stripped.startswith("~~~")):
            in_code_block = True
            fence_marker = stripped[:3]
            code_line_count = 0
            truncated = False
            result.append(line)
        elif in_code_block and stripped == fence_marker:
            in_code_block = False
            if not truncated:
                result.append(line)
            # If truncated, we already closed the fence
        elif in_code_block:
            code_line_count += 1
            if code_line_count <= max_lines:
                result.append(line)
            elif not truncated:
                result.append("")
                result.append(f"[... truncated ({code_line_count}+ lines)]")
                result.append(fence_marker)
                truncated = True
        else:
            result.append(line)

    return "\n".join(result)


def truncate_tool_output(text, max_lines=MAX_TOOL_OUTPUT_LINES):
    """Truncate long tool output."""
    lines = text.split("\n")
    if len(lines) <= max_lines:
        return text
    return "\n".join(lines[:max_lines]) + f"\n[... truncated ({len(lines)} total lines)]"


def convert_jsonl_to_markdown(input_path, output_path=None):
    """Convert a JSONL transcript to readable Markdown."""
    input_path = Path(input_path)
    if output_path is None:
        output_path = input_path.with_suffix(".md")
    else:
        output_path = Path(output_path)

    stem = input_path.stem
    if stem in SESSION_TITLES:
        date_str, session_str = SESSION_TITLES[stem]
    else:
        date_str = "Unknown"
        session_str = stem.replace("-", " ").title()

    # Parse all lines
    entries = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            entries.append(obj)

    # Build conversation blocks
    # Merge consecutive assistant entries into one turn, same for human.
    # blocks: list of (role, timestamp, parts)
    #   role: "human" or "assistant"
    #   parts: list of (part_type, content)
    blocks = []
    current_role = None
    current_timestamp = None
    current_parts = []

    def flush():
        nonlocal current_role, current_timestamp, current_parts
        if current_role and current_parts:
            blocks.append((current_role, current_timestamp, current_parts))
        current_role = None
        current_timestamp = None
        current_parts = []

    for obj in entries:
        obj_type = obj.get("type", "")
        msg = obj.get("message", {})
        role = msg.get("role", "")
        content = msg.get("content", "")
        timestamp = obj.get("timestamp", "")

        if obj_type in ("file-history-snapshot", "progress"):
            continue

        # Actual human message (string content, not tool_result)
        if obj_type == "user" and isinstance(content, str) and content.strip():
            if current_role != "human":
                flush()
                current_role = "human"
                current_timestamp = timestamp
            current_parts.append(("text", content.strip()))

        # Tool result (list content from user type = tool results being returned)
        elif obj_type == "user" and isinstance(content, list):
            for item in content:
                if item.get("type") == "tool_result":
                    tool_content = item.get("content", "")
                    if isinstance(tool_content, list):
                        tool_content = "\n".join(
                            t.get("text", "") for t in tool_content if t.get("type") == "text"
                        )
                    if tool_content and tool_content.strip():
                        if current_role == "assistant":
                            current_parts.append(("tool_result", tool_content.strip()))

        # Assistant messages
        elif obj_type == "assistant" and isinstance(content, list):
            if current_role != "assistant":
                flush()
                current_role = "assistant"
                current_timestamp = timestamp

            for item in content:
                item_type = item.get("type", "")
                if item_type == "text":
                    text = item.get("text", "").strip()
                    if text:
                        current_parts.append(("text", text))
                elif item_type == "tool_use":
                    name = item.get("name", "unknown")
                    inp = item.get("input", {})
                    if name == "Bash":
                        desc = inp.get("description", "")
                        cmd = inp.get("command", "")
                        label = desc if desc else (cmd[:120] + ("..." if len(cmd) > 120 else ""))
                        current_parts.append(("tool_use", f"**{name}**: `{label}`"))
                    elif name in ("Read", "Glob", "Grep"):
                        target = inp.get("file_path", inp.get("pattern", inp.get("path", str(inp))))
                        current_parts.append(("tool_use", f"**{name}**: `{target}`"))
                    elif name in ("Write", "Edit"):
                        target = inp.get("file_path", "")
                        current_parts.append(("tool_use", f"**{name}**: `{target}`"))
                    else:
                        current_parts.append(("tool_use", f"**{name}**: {json.dumps(inp)[:120]}"))
                elif item_type == "thinking":
                    pass  # Skip internal reasoning

    flush()

    # Render to markdown
    lines = []
    lines.append("# Development Transcript: VR Endless Forest\n")
    lines.append(f"**Date**: {date_str}")
    lines.append(f"**Session**: {session_str}\n")
    lines.append("---\n")

    for role, timestamp, parts in blocks:
        ts_str = format_timestamp(timestamp)
        ts_display = f" [{ts_str}]" if ts_str else ""

        if role == "human":
            lines.append(f"### **Human**{ts_display}\n")
        else:
            lines.append(f"### **Claude**{ts_display}\n")

        for part_type, content in parts:
            if part_type == "text":
                lines.append(truncate_code_blocks(content))
                lines.append("")
            elif part_type == "tool_use":
                lines.append(f"> {content}\n")
            elif part_type == "tool_result":
                truncated = truncate_tool_output(content)
                lines.append("<details><summary>Tool Output</summary>\n")
                lines.append("```")
                lines.append(truncated)
                lines.append("```\n")
                lines.append("</details>\n")

        lines.append("---\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Converted: {input_path.name} -> {output_path.name}")
    print(f"  {len(blocks)} conversation blocks")
    return output_path


def convert_all(directory=None):
    """Convert all JSONL files in the given directory."""
    if directory is None:
        directory = Path(__file__).parent
    else:
        directory = Path(directory)

    jsonl_files = sorted(directory.glob("*.jsonl"))
    if not jsonl_files:
        print(f"No .jsonl files found in {directory}")
        return

    for f in jsonl_files:
        convert_jsonl_to_markdown(f)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert.py <input.jsonl> [output.md]")
        print("       python convert.py --all")
        sys.exit(1)

    if sys.argv[1] == "--all":
        convert_all()
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        convert_jsonl_to_markdown(input_file, output_file)
