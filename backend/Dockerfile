FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt requirements-category.txt ./

RUN pip install --no-cache-dir -r requirements.txt

RUN pip install --no-cache-dir torch==2.5.1 \
    --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements-category.txt

COPY app ./app
COPY eval/__init__.py eval/category_train*.py eval/category_candidates_reviewed.csv ./eval/

ENV HF_HOME=/app/.cache/huggingface

RUN python -m eval.category_train_v4 train --with-authored \
    --data eval/category_candidates_reviewed.csv \
    --output eval/models/category_v4

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    CATEGORY_MODEL_ENABLED=true \
    CATEGORY_MODEL_PATH=/app/eval/models/category_v4/model.joblib \
    CATEGORY_MODEL_THRESHOLD=0.5

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}