import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import ResponseHandlingException
from sklearn.feature_extraction.text import HashingVectorizer

from app.config import MAX_AUDIO_BYTES, Settings
from app.knowledge import MANIFEST_ID, KnowledgeBase
from app.main import create_app


@pytest.fixture
def cloud(tmp_path, monkeypatch):
    database = QdrantClient(":memory:")
    # Use the real vector engine with an isolated shared store, never a live account.
    proxy = Mock(wraps=database)
    proxy.close = Mock()
    proxy.create_payload_index = Mock()
    monkeypatch.setattr("app.knowledge.QdrantClient", Mock(return_value=proxy))
    settings = Settings(
        _env_file=None, ai_mode="openai", openai_api_key="test-key",
        qdrant_url="https://test-cluster.example", qdrant_api_key="test-cluster-key",
        data_dir=tmp_path / "must-not-be-created", resume_path="", vercel=False,
    )
    vectorizer = HashingVectorizer(n_features=1024, alternate_sign=False, stop_words="english")
    monkeypatch.setattr(KnowledgeBase, "embed", lambda self, texts: vectorizer.transform(texts).toarray().tolist())
    resume = tmp_path / "resume.md"
    resume.write_text("Fictional fixture: Python engineer at Example Labs. Built FastAPI services.", encoding="utf-8")
    yield settings, proxy, resume
    database.close()


def test_fresh_cloud_reader_has_no_local_files_or_mutations(cloud):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    published = writer.ingest([resume])
    writer.close()
    assert "files" not in published
    assert not settings.storage_path.exists()
    database.reset_mock()
    reader = KnowledgeBase(settings)
    try:
        assert reader.active_manifest() == published
        assert reader.search("Python engineer")[0].document == "resume.md"
        database.upsert.assert_not_called()
        database.create_collection.assert_not_called()
        database.create_payload_index.assert_not_called()
        assert not settings.storage_path.exists()
    finally:
        reader.close()


def test_warm_reader_observes_replacement_and_old_reads_remain_valid(cloud):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    reader = KnowledgeBase(settings)
    try:
        old = writer.ingest([resume])
        assert reader.manifest["generation"] == old["generation"]
        resume.write_text("Fictional fixture: Biology researcher studying photosynthesis.", encoding="utf-8")
        new = writer.ingest([resume])
        assert reader.manifest["generation"] == new["generation"]
        assert "Biology" in reader.search("Biology researcher")[0].text
        assert database.count(writer.collection, count_filter=writer.generation_filter(old["generation"])).count == old["chunks"]
        database.delete.assert_not_called()
    finally:
        writer.close()
        reader.close()


def test_cloud_repeat_ingestion_does_not_embed_or_publish(cloud, monkeypatch):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    try:
        first = writer.ingest([resume])
        embed = Mock(side_effect=AssertionError("Unchanged document must not be embedded again"))
        monkeypatch.setattr(writer, "embed", embed)
        database.reset_mock()
        assert writer.ingest([resume]) == first
        embed.assert_not_called()
        database.upsert.assert_not_called()
    finally:
        writer.close()


def test_failed_cloud_manifest_publication_preserves_active_generation(cloud, monkeypatch):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    try:
        first = writer.ingest([resume])
        resume.write_text("Replacement fixture: Biology researcher.", encoding="utf-8")
        monkeypatch.setattr(writer, "publish_manifest", Mock(side_effect=RuntimeError("Publication failed")))
        with pytest.raises(RuntimeError, match="Publication failed"):
            writer.ingest([resume])
        assert writer.active_manifest() == first
        assert "Python" in writer.search("Python engineer")[0].text
    finally:
        writer.close()


def test_missing_cloud_metadata_does_not_reuse_a_local_manifest(cloud):
    settings, database, _ = cloud
    settings.storage_path.mkdir()
    reader = KnowledgeBase(settings)
    try:
        reader.manifest_path.write_text(json.dumps({"generation": "stale-local-generation"}), encoding="utf-8")
        assert not reader.ready
        assert reader.search("Python") == []
    finally:
        reader.close()


def test_incomplete_cloud_generation_is_not_ready(cloud):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    try:
        manifest = writer.ingest([resume])
        database.set_payload(writer.metadata_collection, payload={"chunks": manifest["chunks"] + 1}, points=[MANIFEST_ID])
        assert not writer.ready
    finally:
        writer.close()


def test_vercel_cold_start_and_resume_download_use_cloud_and_deployed_asset(cloud, tmp_path):
    settings, database, resume = cloud
    writer = KnowledgeBase(settings)
    writer.ingest([resume])
    writer.close()
    asset = tmp_path / "bundled.pdf"
    asset.write_bytes(b"%PDF-1.4 fictional download fixture")
    settings.vercel = True
    settings.resume_download_path = str(asset)
    database.reset_mock()
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/health")
        assert response.json()["resume_ready"] is True
        assert client.get("/api/resume").content == asset.read_bytes()
        assert not settings.storage_path.exists()
        database.upsert.assert_not_called()
        database.create_collection.assert_not_called()
        with pytest.raises(ValueError, match="operator CLI"):
            client.app.state.knowledge.ingest([resume])


def test_cloud_errors_are_recoverable_and_do_not_leak_credentials(cloud):
    settings, database, _ = cloud
    with TestClient(create_app(settings)) as client:
        database.collection_exists.side_effect = ResponseHandlingException(httpx.ConnectError("private-host-with-secret"))
        response = client.get("/api/health")
        assert response.status_code == 503
        assert "secret" not in response.text
        database.collection_exists.side_effect = None
        assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize("overrides,match", [
    ({"qdrant_url": ""}, "QDRANT_URL"),
    ({"openai_api_key": ""}, "OPENAI_API_KEY"),
    ({"resume_path": "data/resume.pdf"}, "RESUME_PATH"),
    ({"ai_mode": "local"}, "OpenAI mode"),
])
def test_invalid_vercel_configuration_fails_clearly(overrides, match):
    config = {"vercel": True, "ai_mode": "openai", "openai_api_key": "test", "qdrant_url": "https://test.example", "resume_path": ""}
    with pytest.raises(ValidationError, match=match):
        Settings(_env_file=None, **(config | overrides))


def test_vercel_client_ips_are_distinct_for_request_limits(cloud):
    settings, _, _ = cloud
    settings.vercel = True
    settings.chat_rate_limit = "1/minute"
    with TestClient(create_app(settings)) as client:
        for address in ["198.51.100.1", "198.51.100.2"]:
            headers = {"x-vercel-forwarded-for": address}
            assert client.post("/api/chat", json={"message": "Hello"}, headers=headers).status_code == 200
            assert client.post("/api/chat", json={"message": "Hello"}, headers=headers).status_code == 429


def test_shared_rate_limit_storage_is_wired_without_exposing_uri(cloud, monkeypatch):
    settings, _, _ = cloud
    settings.rate_limit_storage_uri = SecretStr("rediss://:private-password@test.example:6379/0")
    original = __import__("app.main", fromlist=["Limiter"]).Limiter
    captured = {}

    def limiter(**kwargs):
        captured.update(kwargs)
        return original(**(kwargs | {"storage_uri": "memory://"}))

    monkeypatch.setattr("app.main.Limiter", limiter)
    with TestClient(create_app(settings)) as client:
        assert "private-password" not in client.get("/api/health").text
    assert captured["storage_uri"] == settings.rate_limit_storage_uri.get_secret_value()


def test_voice_payload_boundaries(cloud):
    settings, _, _ = cloud
    with TestClient(create_app(settings)) as client:
        provider = client.app.state.knowledge.openai
        provider.audio.transcriptions.create = Mock(return_value=SimpleNamespace(text="Question"))
        provider.audio.speech.create = Mock(return_value=SimpleNamespace(content=b"a" * MAX_AUDIO_BYTES))
        accepted = client.post("/api/transcribe", files={"audio": ("recording.webm", b"a" * MAX_AUDIO_BYTES, "audio/webm")})
        assert accepted.status_code == 200
        rejected = client.post("/api/transcribe", files={"audio": ("recording.webm", b"a" * (MAX_AUDIO_BYTES + 1), "audio/webm")})
        assert rejected.status_code == 413
        assert provider.audio.transcriptions.create.call_count == 1
        assert client.post("/api/speech", json={"text": "Hello"}).status_code == 200
        provider.audio.speech.create.return_value.content += b"x"
        assert client.post("/api/speech", json={"text": "Hello"}).status_code == 413


def test_vercel_configuration_has_separate_backend_entrypoint():
    root = Path(__file__).resolve().parents[1]
    config = json.loads((root / "vercel.json").read_text())
    assert config["framework"] == "fastapi"
    assert config["functions"]["app/main.py"]["maxDuration"] == 60
    assert "buildCommand" not in config and "outputDirectory" not in config
    assert (root / ".python-version").read_text().strip() == "3.12"
