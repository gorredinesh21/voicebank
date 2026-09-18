# VoiceBank — single container: build the React app, serve it + the API.
FROM node:20-slim AS webbuild
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ ./
COPY --from=webbuild /build/dist ./web/dist
ENV PORT=8080
CMD exec uvicorn app:app --host 0.0.0.0 --port ${PORT}
