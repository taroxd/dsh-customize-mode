# Customize Mode for DSH

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for choosing what goes into each conversation: the system prompt, the available tools, and automatically added context.

Start with the familiar Standard tool set, keep only the tools you need, or turn them all off for a conversation-only session. Settings are saved with the session and can be adjusted between turns.

## Features

- **Your own system prompt.** Replace the default prompt with any text, including an empty prompt. The editor shows the default template as a placeholder.
- **Individual tool controls.** Search the tool list, enable selected tools, or disable them all, including subagents. Choose whether newly added tools should become available automatically.
- **Optional context.** Include or omit the runtime environment and current time independently.
- **Per-session settings.** Open the settings beside the permission control when Custom mode is selected.
- **English and Chinese UI.** The settings panel follows the language selected in DSH.

## Requirements

Use **DSH 0.2.1-rc.3** with its Web or Desktop interface. The preset selects PowerShell on Windows and Bash on macOS and Linux.

For development, use **Node.js 24 or later** and **pnpm 11**.

## Installation

Open **Plugins** in the DSH sidebar and choose **Add plugin**. Install the package `dsh-customize-mode`, or supply a downloaded release archive. Enable it and follow any restart instruction shown by DSH.

To install a source checkout, run these commands in the project directory:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then use **Add plugin** to install the checkout's absolute directory path. Keep that directory in place while the linked plugin is installed.

## Usage

1. Create a new conversation and choose **Custom mode** before sending the first message.
2. Open **Custom settings** beside the permission control.
3. Adjust the prompt, tools, and automatic context, then select **Save changes**.

Wait for the current turn to finish before saving changes. Saved settings apply to subsequent requests.

### System prompt

Turn on **Use a custom system prompt** to use your own text. Leaving the editor empty clears the system prompt. Text is used exactly as entered, so template expressions such as `{{model}}` stay literal in your own prompt.

To return to the default prompt, turn the switch off.

### Tools

**All available tools** includes tools added later. **Only selected tools** makes only the checked tools available; newly added tools start unchecked. Use **Disable all** for a conversation without tool calls.

### Automatic context

The environment and time switches control what DSH adds to future requests. Existing conversation history stays intact. For a fresh conversation with only your input, clear the system prompt, disable all tools, and turn off both context switches before sending the first message.

Settings change the information and tools available to the model. File permissions and approval settings remain controlled by DSH. Prompts are stored in the session history, so keep credentials out of them.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack --pack-destination artifacts
```

Tests run locally without a model account or manual interaction. The release archive includes the runtime, preset, UI, translations, and icon.

## License

[MIT](<LICENSE>).
