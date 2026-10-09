# Third-party notices

`dsh-computer-use-linux` is an independent DeepSeek Harness integration for
[agent-sh/computer-use-linux](https://github.com/agent-sh/computer-use-linux)
(MIT, Copyright (c) agent-sh and contributors). No upstream source code is
vendored here; the pinned upstream **binaries** are downloaded at runtime from
that project's GitHub releases and verified against the `.sha256` assets it
publishes.

The bundled skill (`skills/computer-use-linux/`) is adapted from the upstream
project's `skills/computer-use-linux/SKILL.md` and its README (MIT), rewritten
for DeepSeek Harness tool names and failure modes. Upstream copyright is
preserved.

The bridge itself is the DeepSeek Harness in-box plugin
`@deepseek-ai/dsh-mcp-client`, which is part of DeepSeek Harness and is not
redistributed here.

## Upstream license

```
MIT License

Copyright (c) agent-sh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
