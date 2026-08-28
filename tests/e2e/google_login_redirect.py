"""
E2E: login social (Google) sempre termina na área de membros (/app).

Simula o retorno do Google/Supabase caindo na LANDING PAGE (`/#access_token=...`),
que é o cenário do bug relatado: o Site URL do projeto sobrescreve o `redirectTo`
e o usuário voltava para "/". O teste garante que o interceptador global de
autenticação conclui a sessão e navega para /app.

Como rodar (servidor de dev já em execução em http://localhost:8080):
    python3 tests/e2e/google_login_redirect.py
"""

import asyncio
import json
import time

from playwright.async_api import async_playwright

BASE_URL = "http://localhost:8080"
SUPABASE_HOST = "**llfgqeotxneprvomllru.supabase.co/**"

USER = {
    "id": "00000000-0000-4000-8000-000000000001",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "aluno.google@example.com",
    "email_confirmed_at": "2026-01-01T00:00:00Z",
    "app_metadata": {"provider": "google", "providers": ["google"]},
    "user_metadata": {"full_name": "Aluno Google"},
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
}

SESSION = {
    "access_token": "fake-access-token",
    "refresh_token": "fake-refresh-token",
    "token_type": "bearer",
    "expires_in": 3600,
    "expires_at": int(time.time()) + 3600,
    "user": USER,
}


async def fake_supabase(route):
    """Responde a todas as chamadas do Supabase (auth + REST) sem rede real."""
    url = route.request.url
    path = url.split("supabase.co", 1)[1]

    if route.request.method == "OPTIONS":
        await route.fulfill(status=204, headers={"access-control-allow-origin": "*"})
        return

    def json_response(payload, status=200):
        return route.fulfill(
            status=status,
            content_type="application/json",
            headers={"access-control-allow-origin": "*"},
            body=json.dumps(payload),
        )

    if "/auth/v1/user" in path:
        await json_response(USER)
    elif "/auth/v1/token" in path:
        await json_response(SESSION)
    elif "/auth/v1/logout" in path:
        await json_response({})
    elif "/rest/v1/profiles" in path:
        # Sessão válida, perfil ativo (não bloqueado).
        await json_response({"id": USER["id"], "status": "student", "email": USER["email"]})
    else:
        # Demais tabelas/prefetches: listas vazias.
        await json_response([])


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        await context.route(SUPABASE_HOST, fake_supabase)
        page = await context.new_page()

        console_errors: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        # Retorno do provedor social caindo na landing page.
        callback = (
            f"{BASE_URL}/#access_token={SESSION['access_token']}"
            f"&refresh_token={SESSION['refresh_token']}"
            f"&token_type=bearer&expires_in=3600&provider_token=google-token"
        )
        await page.goto(callback, wait_until="domcontentloaded")

        try:
            await page.wait_for_url("**/app**", timeout=20_000)
        except Exception:
            print("FAIL: usuário permaneceu fora de /app. URL final:", page.url)
            print("erros de console:", console_errors[:5])
            await browser.close()
            raise SystemExit(1)

        assert "/app" in page.url, page.url
        # Nunca deve permanecer na landing page nem manter tokens na barra de endereço.
        assert "access_token" not in page.url, page.url
        print("PASS: login social terminou em", page.url)

        await browser.close()


asyncio.run(main())
