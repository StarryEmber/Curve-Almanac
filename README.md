# Curve Almanac

**A local-first, offline desktop app for table-driven curve visualization.**

Define a table schema, enter or import data, style it, and turn it into live charts — all in a
folder-based workspace on your machine. No account, no cloud, no telemetry.

[**Download**](https://github.com/StarryEmber/Curve-Almanac/releases) ·
[User Manual](docs/MANUAL.md) ·
[Developer Guide](docs/DEVELOPER.md) ·
[MIT License](LICENSE) ·
[中文](README.zh-CN.md)

![Curve Almanac — table with conditional formatting and style editor](docs/reports/t6.5/t6.5-04-style.png)

## Highlights

- **Flexible schemas** — number, text, date, boolean, and enum columns; roles for X / Y / series /
  label; primary keys, required fields, units, precision, and plugin-provided semantic types.
- **Table styling** — four built-in templates, a visual style editor, column overrides, conditional
  rules, and reusable/importable style templates.
- **Charts from tables** — wide and long mappings, line/scatter/bar charts, zoom and legend
  interaction, LTTB sampling for large data, and 2× PNG export.
- **Designed for real data** — keyboard editing and validation, range paste, CSV/JSON import with
  encoding/delimiter/bad-row handling, filtering, multi-column sorting, and 100k-row workspaces.
- **Data safety** — 1.5 s autosave, crash recovery, undo/redo, atomic writes, and manifest backups.
- **Offline by design** — no network requests, no telemetry, no automatic updates; plugins are
  statically compiled, never downloaded at runtime.
- **Windows installer and portable build** — per-user install, no administrator required.

## Install

Requires **Windows 10/11 x64**.

1. Open [Releases](https://github.com/StarryEmber/Curve-Almanac/releases).
2. Download one of:
   - `Curve Almanac Setup 0.1.0.exe` — per-user installer (defaults to
     `%LOCALAPPDATA%\Programs\Curve Almanac`).
   - `Curve Almanac 0.1.0.exe` — portable single file; extracts to a temporary directory at launch.
3. Run it. The installer is **unsigned**, so SmartScreen may show “Unknown publisher”; choose
   **More info → Run anyway**.

Uninstalling does **not** delete your data:

- `%APPDATA%\Curve Almanac` — settings, recent workspaces, window state, logs.
- `Documents\Curve Almanac` — default parent folder for workspaces.

## Quick start

1. **Create a workspace** — choose a name and location; a workspace is a `Demo.cstudio` folder.
2. **Create a table** — add a primary key column, then add columns with types and roles.
3. **Add data** — edit cells directly, paste a block from Excel, or import CSV/JSON.
4. **Style it** — apply a template, adjust density/colors, add a conditional rule.
5. **Chart it** — create a line/scatter/bar chart, pick X and one or more Y columns, switch between
   wide and long mappings in the inspector.

Edits are saved automatically after 1.5 s. If the app is killed, the next launch offers recovery.
See the [User Manual](docs/MANUAL.md) for the full walkthrough.

## Documentation

| Document | Contents |
|---|---|
| [User Manual](docs/MANUAL.md) | Install, 15-minute tutorial, every feature, shortcuts, FAQ, limitations |
| [Developer Guide](docs/DEVELOPER.md) | Repository layout, commands, boundaries, tests, packaging |
| [Known Limitations](docs/ROADMAP.md) | v1 limitations and maintenance scope (no v2 roadmap) |
| [Agent/Automation Guide](docs/DSH.md) | Environment, commands, testing, packaging, and release workflow for agents |

## Development

Requires Node.js ≥ 20.11 and pnpm 11.

```bash
pnpm install
pnpm dev          # Electron development mode
pnpm verify       # lint + typecheck + unit tests
pnpm build        # renderer + main + preload
pnpm package      # NSIS installer + portable build in release/
```

Full test, benchmark, packaging, and release instructions are in the
[Developer Guide](docs/DEVELOPER.md).

## AI-assisted development & technical disclaimer

### AI-assisted development

The core code of Curve Almanac was implemented with assistance from **DeepSeek Harness** and
**DeepSeek v4.1 Flash**. AI assisted with code generation, refactoring, debugging, test authoring,
and documentation drafts. Feature definition, design trade-offs, testing/acceptance, and release
decisions were made by the human maintainer, **StarryEmber**. All AI-assisted output was reviewed
before inclusion; the maintainer is responsible for the final code and releases. AI tools are not
copyright holders.

### Technical risks and disclaimer

This project contains AI-assisted code and depends on third-party components such as Electron,
Chromium, Node.js, and ECharts, as well as external environments including Windows, drivers,
antivirus software, and security policies. These factors are inherently uncertain and may cause
defects, security vulnerabilities, compatibility issues, performance fluctuations, or data
anomalies. The maintainer cannot guarantee that the software will be completely correct, stable,
secure, or fit for any particular purpose in every environment or dataset.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
NON-INFRINGEMENT, FREEDOM FROM VIRUSES, UNINTERRUPTED OPERATION, OR ERROR-FREE OPERATION. Evaluate
and test the software before use, and back up important data. To the maximum extent permitted by
applicable law, the maintainer is not liable for any direct or indirect loss, data loss or
corruption, business interruption, loss of profits, or third-party claims arising from the use of
or inability to use this software. The warranty disclaimer in [LICENSE](LICENSE) prevails.

## License

[MIT](LICENSE) © 2026 StarryEmber. Third-party components remain under their own licenses.
“Curve Almanac” is a product name and is not licensed as a trademark.
