FROM python:3.12-slim
WORKDIR /app

# Install build dependencies for native packages (asyncua, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p data logs

EXPOSE 3000
CMD ["python", "main.py"]
