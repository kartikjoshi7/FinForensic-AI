FROM python:3.11-slim

WORKDIR /app

# Copy requirements using the repository root path
COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend contents into the container root
COPY backend/ .

# Pre-download ChromaDB models to avoid Cloud Run startup timeouts
RUN python -c "import chromadb; chromadb.Client().get_or_create_collection('warmup')"

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}