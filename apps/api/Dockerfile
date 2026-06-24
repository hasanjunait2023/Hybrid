# Hybrid async jobs service (FastAPI). Connects to the self-hosted Supabase
# Postgres as app_runtime_login (RLS forced). Run on the same Docker network as
# supabase-db; trigger /jobs/* with the CRON_SECRET bearer.
FROM python:3.12-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

EXPOSE 8000
# 1 worker: jobs are I/O-bound and DB-pool-bound; scale via replicas, not workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
