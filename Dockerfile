FROM envoyproxy/envoy:tools-dev-86dd82f76a61e38a2de7b411c9da755cd9f67f4c AS envoy-bin
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

COPY --from=envoy-bin /usr/local/bin/envoy /usr/local/bin/envoy

COPY envoy/envoy.yaml /etc/envoy/envoy.yaml
COPY envoy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8060

ENTRYPOINT ["/entrypoint.sh"]
