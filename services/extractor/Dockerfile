FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY remi_extractor ./remi_extractor
RUN useradd --system --uid 10001 extractor
USER extractor
EXPOSE 4003
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4003/health', timeout=2)"]
CMD ["/app/.venv/bin/python", "-m", "remi_extractor"]
