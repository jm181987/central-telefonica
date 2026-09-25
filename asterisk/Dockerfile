FROM debian:12-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    asterisk asterisk-modules asterisk-core-sounds-en-wav asterisk-moh-opsound-wav \
    gettext-base ca-certificates fail2ban iproute2 procps && \
    rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5061/tcp 8088/tcp 5038/tcp 10000-20000/udp
ENTRYPOINT ["/entrypoint.sh"]
