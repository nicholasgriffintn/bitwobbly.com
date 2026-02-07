FROM apache/superset:latest

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      g++ \
      libpq-dev \
      default-libmysqlclient-dev \
      freetds-dev \
      pkg-config \
      curl \
      netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

RUN . /app/.venv/bin/activate && \
      uv pip install \
      psycopg2-binary \
      PyMySQL \
      mysqlclient \
      pymssql \
      trino \
      apache-superset[trino] \
      openpyxl \
      redis \
      flask-cors \
      gunicorn \
      gevent

RUN python -c "import psycopg2; print('psycopg2 OK')" && \
    python -c "import redis; print('redis OK')" && \
    python -c "import flask_cors; print('flask-cors OK')"

RUN apt-get purge -y \
      build-essential \
      gcc \
      g++ \
      libpq-dev \
      pkg-config && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

USER superset

WORKDIR /app

ENV FLASK_APP=superset
ENV PYTHONPATH="/app/pythonpath:$PYTHONPATH"

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8088/health || exit 1

CMD ["superset", "run", "-h", "0.0.0.0", "-p", "8088"]