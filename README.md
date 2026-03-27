# React Native Performance Doctor

Claude Code Skill for diagnosing and fixing React Native performance issues.

## Features

- **Automatic Diagnosis**: 67 performance rules covering 7 categories
- **Auto-fix Suggestions**: Generate optimized code
- **New Architecture Support**: Fabric + TurboModules (RN 0.76+)
- **React 19 Compatible**: Handles Compiler memoization changes

## Installation

```bash
npx claude-code-templates@latest --skill react-native-performance-doctor
```

Or manually: Copy `SKILL.md` to your Claude Code skills directory.

## Usage

Activate by keywords:
- "react-native performance"
- "卡顿" / "帧率低"
- "内存泄漏"
- "启动慢"
- "FlatList 优化"

## Diagnostic Rules (67 rules)

| Category | Count |
|----------|-------|
| List Performance | 15 |
| Render Performance | 12 |
| Memory & Leak | 10 |
| Startup Performance | 8 |
| Image & Media | 8 |
| New Architecture | 8 |
| Config & Tools | 6 |

## Compatible Versions

- React Native 0.76+
- Expo SDK 52+
- React 19 (with Compiler)

## License

MIT