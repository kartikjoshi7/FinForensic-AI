FROM python:3.11-slim

WORKDIR /app

# Copy requirements using the repository root path
COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend contents into the container root
COPY backend/ .

# Pre-download ChromaDB ONNX models to avoid massive latency on first upload
RUN python -c "from chromadb.utils import embedding_functions; ef = embedding_functions.DefaultEmbeddingFunction(); ef(['warmup'])"

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}