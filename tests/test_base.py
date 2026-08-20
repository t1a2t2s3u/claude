import pytest

from seo_meo.sources.base import AccessNotGrantedError, ApiError, request_json


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def get(self, url, params=None):
        self.calls.append((url, params))
        return self._responses.pop(0)


def test_returns_json_on_success():
    session = FakeSession([FakeResponse(200, {"ok": True})])
    assert request_json(session, "https://example.test") == {"ok": True}


def test_retries_transient_failures_then_succeeds():
    session = FakeSession(
        [FakeResponse(503, text="unavailable"), FakeResponse(200, {"ok": True})]
    )
    slept = []
    result = request_json(session, "https://example.test", sleep=slept.append)

    assert result == {"ok": True}
    assert len(session.calls) == 2
    assert slept == [2.0]


def test_backoff_is_exponential_and_bounded_by_max_attempts():
    session = FakeSession([FakeResponse(503, text="nope") for _ in range(4)])
    slept = []

    with pytest.raises(ApiError):
        request_json(session, "https://example.test", sleep=slept.append)

    assert slept == [2.0, 4.0, 8.0]
    assert len(session.calls) == 4


def test_403_explains_that_api_access_needs_approval():
    session = FakeSession([FakeResponse(403, text="permission denied")])
    with pytest.raises(AccessNotGrantedError) as exc:
        request_json(session, "https://example.test")
    assert "承認" in str(exc.value)


def test_404_is_not_retried():
    session = FakeSession([FakeResponse(404, text="not found")])
    with pytest.raises(ApiError) as exc:
        request_json(session, "https://example.test", sleep=lambda _: None)
    assert exc.value.status == 404
    assert len(session.calls) == 1
