# Backend image: Flask API + video/ML processing.
# dlib (face_recognition) is compiled from source, so the first build takes a while.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake \
        libgl1 libglib2.0-0 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-api.txt requirements.txt ./
RUN pip install -r requirements.txt

COPY flaskr ./flaskr
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

ENV STORAGE_PATH=/data
VOLUME ["/data"]
EXPOSE 5000

ENTRYPOINT ["docker-entrypoint.sh"]
# One process (stream state is in memory), many threads (each MJPEG viewer holds one)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "32", \
     "--timeout", "0", "flaskr:create_app()"]
