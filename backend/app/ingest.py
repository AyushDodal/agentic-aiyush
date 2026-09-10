import argparse
from pathlib import Path

from .config import BACKEND_DIR, Settings
from .knowledge import KnowledgeBase


def main():
    parser = argparse.ArgumentParser(description="Replace the avatar's resume corpus. Stop the local API before running.")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--local", action="store_true", help="Use local lexical embeddings; no API calls.")
    args = parser.parse_args()
    settings = Settings(ai_mode="local") if args.local else Settings()
    knowledge = KnowledgeBase(settings)
    try:
        paths = [path if path.is_absolute() else Path.cwd() / path for path in args.files]
        manifest = knowledge.ingest(paths)
        print(f"Indexed {manifest['chunks']} chunks from {len(manifest['documents'])} document(s).")
        print(f"Mode: {'OpenAI' if settings.use_openai else 'local extractive search'}")
        print(f"Storage: {settings.storage_path.relative_to(BACKEND_DIR) if settings.storage_path.is_relative_to(BACKEND_DIR) else settings.storage_path}")
    finally:
        knowledge.close()


if __name__ == "__main__":
    main()
