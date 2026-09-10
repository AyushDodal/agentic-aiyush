import hashlib
import json
import re
import threading
import uuid
from pathlib import Path

from openai import OpenAI
from qdrant_client import QdrantClient, models

from .config import Settings
from .models import Source

MANIFEST_ID = "00000000-0000-0000-0000-000000000001"


class KnowledgeBase:
    def __init__(self, settings: Settings):
        self.settings = settings
        if not settings.qdrant_url:
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
        self.vectorizer = None
        if not self.openai:
            from sklearn.feature_extraction.text import HashingVectorizer

            self.vectorizer = HashingVectorizer(
                n_features=1024, alternate_sign=False, stop_words="english", norm="l2"
            )
        signature = settings.embedding_model if self.openai else "hashing-1024-v1"
        self.collection = "resume_" + hashlib.sha256(signature.encode()).hexdigest()[:12]
        self.metadata_collection = self.collection + "_metadata"
        self.manifest_path = settings.storage_path / (self.collection + ".json")
        self._local_manifest = (
            json.loads(self.manifest_path.read_text(encoding="utf-8"))
            if not settings.qdrant_url and self.manifest_path.exists()
            else None
        )

    @property
    def manifest(self) -> dict | None:
        if not self.settings.qdrant_url:
            return self._local_manifest
        if not self.client.collection_exists(self.metadata_collection):
            return None
        records = self.client.retrieve(
            self.metadata_collection, ids=[MANIFEST_ID], with_payload=True, with_vectors=False
        )
        return records[0].payload if records else None

    def publish_manifest(self, manifest: dict):
        if self.settings.qdrant_url:
            if not self.client.collection_exists(self.metadata_collection):
                self.client.create_collection(self.metadata_collection, vectors_config={})
            self.client.upsert(self.metadata_collection, points=[
                models.PointStruct(id=MANIFEST_ID, vector={}, payload=manifest)
            ], wait=True)
        else:
            temporary = self.manifest_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            temporary.replace(self.manifest_path)
            self._local_manifest = manifest

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
        return self.active_manifest() is not None

    def active_manifest(self) -> dict | None:
        with self.lock:
            manifest = self.manifest
            if not manifest or not self.client.collection_exists(self.collection):
                return None
            count = self.client.count(
                self.collection, exact=True, count_filter=self.generation_filter(manifest["generation"])
            ).count
            return manifest if count == manifest["chunks"] and count > 0 else None

    @staticmethod
    def generation_filter(generation: str) -> models.Filter:
        return models.Filter(must=[models.FieldCondition(
            key="generation", match=models.MatchValue(value=generation)
        )])

    def ingest(self, paths: list[Path]) -> dict:
        if self.settings.vercel:
            raise ValueError("Ingestion must run outside Vercel, using the operator CLI.")
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from pypdf import PdfReader

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
        active = self.active_manifest()
        if active and active["checksum"] == checksum:
            return active

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
            if self.settings.qdrant_url:
                self.client.create_payload_index(
                    self.collection, field_name="generation",
                    field_schema=models.PayloadSchemaType.KEYWORD, wait=True,
                )
            self.client.upsert(self.collection, points=points, wait=True)
            manifest = {
                "checksum": checksum, "generation": generation, "chunks": len(chunks),
                "documents": [path.name for path in paths],
            }
            if not self.settings.qdrant_url:
                manifest["files"] = [str(path.resolve()) for path in paths]
            self.publish_manifest(manifest)
            # Cloud readers may still be using the previous generation. Retain it
            # until the operator can retire it with no in-flight requests.
            if not self.settings.qdrant_url:
                self.client.delete(
                    self.collection,
                    points_selector=models.FilterSelector(filter=models.Filter(must_not=[
                        models.FieldCondition(key="generation", match=models.MatchValue(value=generation))
                    ])), wait=True,
                )
        return manifest

    def search(self, question: str, limit: int = 5) -> list[Source]:
        manifest = self.active_manifest()
        if not manifest:
            return []
        vector = self.embed([question])[0]
        with self.lock:
            matches = self.client.query_points(
                self.collection, query=vector, limit=limit, with_payload=True,
                score_threshold=0.23 if self.openai else 0.12,
                query_filter=self.generation_filter(manifest["generation"]),
            ).points
        return [Source(id=str(point.id), **{
            key: point.payload[key] for key in ("document", "page", "text")
        }) for point in matches]
