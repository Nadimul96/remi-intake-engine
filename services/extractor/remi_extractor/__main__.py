"""Run the extractor with `python -m remi_extractor`."""

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "remi_extractor.app:app",
        host=os.environ.get("EXTRACTOR_HOST", "0.0.0.0"),
        port=int(os.environ.get("EXTRACTOR_PORT", "4003")),
    )
