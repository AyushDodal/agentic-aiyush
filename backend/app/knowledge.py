import hashlib
import json
import re
import threading
import uuid
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from pypdf import PdfReader
from qdrant_client import QdrantClient, models
from sklearn.feature_extraction.text import HashingVectorizer

from .config import Settings
from .models import Source


class KnowledgeBase:
    def __init__(self, settings: Settings):
        self.settings = settings
        settings.storage_path.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.client = (
            QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key.get_secret_value() or None,
                timeout=20,
            )
            if settings.qdrant_url
            else QdrantClient(path=str(settings.storage_path / "qdrant"))
        )
        self.openai = (
            OpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=35, max_retries=1)
            if settings.use_openai
            else None
        )
        self.vectorizer = HashingVectorizer(
            n_features=1024, alternate_sign=False, stop_words="english", norm="l2"
        )
        signature = settings.embedding_model if self.openai else "hashing-1024-v1"
        self.collection = "resume_" + hashlib.sha256(signature.encode()).hexdigest()[:12]
        self.manifest_path = settings.storage_path / (self.collection + ".json")
        self.manifest = (
            json.loads(self.manifest_path.read_text(encoding="utf-8"))
            if self.manifest_path.exists()
            else None
        )

    def close(self):
        self.client.close()
        if self.openai:
            self.openai.close()

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self.openai:
            vectors = []
            for start in range(0, len(texts), 64):
                response = self.openai.embeddings.create(
                    model=self.settings.embedding_model, input=texts[start:start + 64],
                    dimensions=1024,
                )
                vectors.extend(item.embedding for item in sorted(response.data, key=lambda item: item.index))
            return vectors
        return self.vectorizer.transform(texts).toarray().tolist()

    @property
    def ready(self) -> bool:
        with self.lock:
            return bool(
                self.manifest
                and self.client.collection_exists(self.collection)
                and self.client.count(self.collection, exact=True).count
            )

    def ingest(self, paths: list[Path]) -> dict:
        splitter = RecursiveCharacterTextSplitter(chunk_size=950, chunk_overlap=180)
        chunks = []
        digest = hashlib.sha256(b"resume-layout-v1")
        for path in paths:
            if path.suffix.lower() not in {".pdf", ".md", ".txt"}:
                raise ValueError("Resume files must be PDF, Markdown, or plain text.")
            if path.stat().st_size > 10 * 1024 * 1024:
                raise ValueError("Resume files must be at most 10 MB each.")
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
            pages = (
                [(index + 1, page.extract_text(extraction_mode="layout") or "") for index, page in enumerate(PdfReader(path).pages)]
                if path.suffix.lower() == ".pdf"
                else [(None, path.read_text(encoding="utf-8-sig"))]
            )
            for page, text in pages:
                text = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
                for chunk in splitter.split_text(text):
                    chunks.append({"document": path.name, "page": page, "text": chunk})
        if not chunks:
            raise ValueError("No readable text found. Scanned PDFs require OCR before ingestion.")
        if len(chunks) > 500:
            raise ValueError("Resume corpus exceeds 500 chunks. Supply a smaller set of documents.")
        checksum = digest.hexdigest()
        if self.ready and self.manifest["checksum"] == checksum:
            return self.manifest

        # Build a new generation first; publish it only after every vector is stored.
        vectors = self.embed([chunk["text"] for chunk in chunks])
        generation = str(uuid.uuid4())
        points = [
            models.PointStruct(id=str(uuid.uuid4()), vector=vector, payload={**chunk, "generation": generation})
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        with self.lock:
            if not self.client.collection_exists(self.collection):
                self.client.create_collection(
                    self.collection,
                    vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
                )
            self.client.upsert(self.collection, points=points, wait=True)
            manifest = {
                "checksum": checksum, "generation": generation, "chunks": len(chunks),
                "documents": [path.name for path in paths],
                "files": [str(path.resolve()) for path in paths],
            }
            temporary = self.manifest_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            temporary.replace(self.manifest_path)
            self.manifest = manifest
            self.client.delete(
                self.collection,
                points_selector=models.FilterSelector(filter=models.Filter(must_not=[
                    models.FieldCondition(key="generation", match=models.MatchValue(value=generation))
                ])), wait=True,
            )
        return manifest

    def search(self, question: str, limit: int = 5) -> list[Source]:
        if not self.ready:
            return []
        vector = self.embed([question])[0]
        with self.lock:
            matches = self.client.query_points(
                self.collection, query=vector, limit=limit, with_payload=True,
                score_threshold=0.23 if self.openai else 0.12,
                query_filter=models.Filter(must=[models.FieldCondition(
                    key="generation", match=models.MatchValue(value=self.manifest["generation"])
                )]),
            ).points
        return [Source(id=str(point.id), **{
            key: point.payload[key] for key in ("document", "page", "text")
        }) for point in matches]
