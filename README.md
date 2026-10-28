# Customize Mode for DSH

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that lets you customize the system prompt, enabled tools, and extra context for each conversation.

## Features

- **Custom system prompt** — Replace the default prompt with your own text, or leave it empty to send no system prompt.
- **Tool selection** — Enable only the tools you need, or disable all tools for a text-only chat.
- **Extra context** — Toggle environment info and current time independently.
- **Per-session & default settings** — Apply changes to the current conversation, or save them as the default for new Custom mode conversations.
- **Bilingual UI** — Follows the DSH interface language (English and Chinese).

## Requirements

- DeepSeek Harness `0.2.1-rc.3` (Web or Desktop)
- Node.js 24+ and pnpm 11 (for development)

## Installation

In DSH, open **Plugins** → **Add plugin**, and install `dsh-customize-mode` or select a release `.tgz` archive.

To install from source:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then select the repository folder in **Add plugin**.

## Usage

1. Start a new conversation and select **Custom mode** (`自定义模式`).
2. Click **Custom settings** in the input bar.
3. Configure the prompt, tools, and context:
   - **Apply to session** — Updates the current conversation (takes effect on the next turn) and closes the dialog.
   - **Save as default** — Saves the current configuration as the initial settings for new Custom mode conversations.

### System Prompt

Enable **Use a custom system prompt** to edit the prompt. Leave the text box empty to send no system prompt at all.

Prompt text supports `{{model}}`, `{{provider}}`, and variables registered by other plugins. Variables are resolved when sending a message. Click **Fill with default prompt** to copy the default template into the editor.

### Tools

- **All available tools** — Enables all current and newly added tools.
- **Selected tools only** — Enables only the checked tools. Newly added tools remain unchecked by default.

### Extra Context

Toggle **Include environment info** and **Include current time** to control whether DSH attaches workspace environment details and timestamps to future messages.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack --pack-destination artifacts
```

## License

[MIT](<LICENSE>)
