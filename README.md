# Customize Mode for DSH

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for choosing what goes into each conversation: the system prompt, the available tools, and automatically added context.

Start with the familiar Standard tool set, keep only the tools you need, or turn them all off for a conversation-only session. Settings are saved with the session and can be adjusted at any time for the next turn.

## Features

- **Your own system prompt.** Replace the default prompt with any text, including an empty prompt. The editor shows the default template as a placeholder.
- **Individual tool controls.** Search the tool list, enable selected tools, or disable them all, including subagents. Choose whether newly added tools should become available automatically.
- **Optional context.** Include or omit the runtime environment and current time independently.
- **Per-session settings.** Open the settings beside the permission control when Custom mode is selected.
- **Global defaults.** Save a starting configuration for future Custom mode conversations across every workspace in the same DSH profile, without changing existing conversations.
- **English and Chinese UI.** The settings panel follows the language selected in DSH.

## Requirements

Use **DSH 0.2.1-rc.3** with its Web or Desktop interface. The preset selects PowerShell on Windows and Bash on macOS and Linux.

For development, use **Node.js 24 or later** and **pnpm 11**.

## Installation

Open **Plugins** in the DSH sidebar and choose **Add plugin**. Install the package `dsh-customize-mode`, or supply a downloaded release archive. Enable it and follow any restart instruction shown by DSH.

Wait for active Custom mode replies to finish before upgrading the plugin itself. A hot upgrade cancels an in-progress Custom turn to avoid mixing old and new policies; ordinary settings saves do not interrupt replies.

To install a source checkout, run these commands in the project directory:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Then use **Add plugin** to install the checkout's absolute directory path. Keep that directory in place while the linked plugin is installed.

## Usage

1. Create a new conversation and choose **Custom mode** before sending the first message.
2. Open **Custom settings** beside the permission control.
3. Adjust the prompt, tools, and automatic context, then choose the operation you need:

| Action | Scope | After success |
| --- | --- | --- |
| **Apply to session** | Only the current conversation | Closes the window immediately |
| **Save as default** (bottom left) | Future new conversations in every workspace of this DSH profile | Keeps the window open; does not apply the draft to the current conversation |

To use the same settings both now and in future conversations, select **Save as default**, then **Apply to session**. Failures keep the window open with your edits and an error message.

You can apply changes while a reply is running. The current turn keeps its existing settings, including any further tool calls and model steps. The latest session settings apply from the next turn.

Global defaults survive application restarts. Each newly created conversation captures its starting settings once and uses them when Custom mode is selected, including conversations created in a new workspace. Later default changes do not alter existing, reopened, or forked conversations. Other presets do not apply Custom mode policies. Separate DSH profiles keep separate defaults.

### System prompt

Turn on **Use a custom system prompt** to use your own text. Leaving the editor empty clears the system prompt. Text is used exactly as entered, so template expressions such as `{{model}}` stay literal in your own prompt.

With the custom prompt switch on, select **Fill with default system prompt** to copy the default template into the editor. If the editor already contains text (including whitespace), a confirmation dialog lets you replace it or cancel and keep your text. Filling changes only the draft; select **Apply to session** or **Save as default** when ready. Copied template expressions remain literal, just like text you type.

To use DSH's built-in system prompt instead, turn the switch off. This does not reset your saved global defaults.

### Tools

**All available tools** includes tools added later. **Only selected tools** makes only the checked tools available; newly added tools start unchecked. Use **Disable all** for a conversation without tool calls.

### Automatic context

The environment and time switches control what DSH adds to future requests. Existing conversation history stays intact. For a fresh conversation with only your input, clear the system prompt, disable all tools, and turn off both context switches before sending the first message.

Settings change the information and tools available to the model. File permissions and approval settings remain controlled by DSH. Prompts are stored in session history and, if saved as defaults, in local persistent settings. Keep credentials out of them.

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
