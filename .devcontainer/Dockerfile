# Markdown Explorer Devcontainer
# Extends claudio-base with VS Code extension development tooling

FROM ghcr.io/ksizzle88/claudio:latest

LABEL com.claudio.project="md-explorer"

USER root

# VS Code extension packaging tool (vsce) is installed via npm devDeps,
# but ensure TypeScript is globally available for convenience
RUN npm install -g typescript@5

USER dev

WORKDIR /workspace

HEALTHCHECK --interval=2m --timeout=10s --start-period=15s --retries=3 \
    CMD command -v node >/dev/null && command -v claude >/dev/null
