# Customize Mode for DSH

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds **Custom mode**. Pick any mode as the base, then change its system prompt, tools, and extra context for each conversation. Save the settings you like as presets and reuse them.

## Features

- **Any base mode** — Build on Standard, PTC, Minimal, Creator, or a mode you installed. Custom mode keeps the base mode's tools, skills, and plugins.
- **Custom system prompt** — Replace the base mode's prompt with your own text, or leave it empty to send no system prompt.
- **Tool selection** — Keep every tool of the base mode, or turn on only the ones you need.
- **Extra context** — Turn environment info and the current time on or off.
- **Presets** — Save settings with a title and a note, load them later, and choose a default preset for new conversations.
- **Bilingual** — Follows the DSH interface language (English or Chinese), including the mode name.

## Requirements

- DeepSeek Harness `0.2.2-rc.1` or later (Web or Desktop)
- Node.js 24+ and pnpm 11, for development only

## Installation

In DSH, open **Plugins** → **Add plugin**, then install `dsh-customize-mode` or choose a release `.tgz` file.

To install from source:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then choose the repository folder in **Add plugin**.

## Usage

1. Start a new conversation and choose **Custom mode** (`自定义模式`) in the mode picker.
2. Click **Custom settings** in the input bar.
3. Adjust the settings, then click **Apply**. Changes take effect from the next message. If a reply is in progress, it finishes with the old settings.

The mode name and description follow the language set in **Settings → General → Language**. If the mode picker is already open, reload the page to see the new language.

### Base mode

Choose which mode Custom mode builds on. Its tools, skills, and plugins are available in the conversation, and the settings below are applied on top.

You can change the base mode only before you send the first message. After that it is fixed; start a new conversation to use a different one.

If the base mode can't be loaded (for example, after its plugin is removed), messages are blocked and the settings window explains why. Open **Custom settings** again after restoring the mode to fix the conversation.

### System prompt

Turn on **Use a custom system prompt** to replace the base mode's prompt. Leave the box empty to send no system prompt at all.

The prompt can use `{{model}}`, `{{provider}}`, and variables from other plugins. They are filled in when a message is sent. Click **Use default prompt** to copy the base mode's prompt into the box as a starting point.

### Tools

- **All tools of the base mode** — Every tool is on, including tools added to the base mode later.
- **Only the selected tools** — Only the checked tools are on. Tools added later stay off until you check them.

Tools that a conversation adds for itself, such as a subagent's result tool, always stay available.

### Extra context

**Include environment info** and **Include the current time** control whether DSH adds workspace details and the current time to new messages. Earlier messages are not changed.

### Presets

Click **Presets** in the settings window to open the preset manager. There you can:

- **Save** the current settings with a title and an optional note. If a preset with the same title exists, you're asked before it is replaced.
- **Load** a preset. Its settings fill the settings window and the manager closes; click **Apply** to use them. In a conversation that has already started, the base mode stays as it is.
- **Delete** a preset after confirming.
- **Set as default** to choose the preset that new Custom mode conversations start with. Click **Remove default** to go back to Standard mode settings.

Presets are saved in your DSH profile and shared by all workspaces. Changing or deleting a preset doesn't affect conversations that already use its settings.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack --pack-destination artifacts
```

See [AGENTS.md](<AGENTS.md>) for the architecture and release steps.

## License

[MIT](<LICENSE>)
